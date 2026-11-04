import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OfficeTask, Prisma } from "@prisma/client";
type TaskCreate = Omit<OfficeTask, "approvedAt" | "completedAt" | "createdAt" | "updatedAt">;
const mock = vi.hoisted(() => ({
  task: null as OfficeTask | null, events: [] as unknown[], cas: 1,
  officeTask: {
    findFirst: vi.fn<(args: { where: { id: string; userId: number } }) => OfficeTask | null>(),
    create: vi.fn<(args: { data: TaskCreate }) => OfficeTask>(),
    updateMany: vi.fn<(args: { where: { id: string; userId: number; status: string; expiresAt?: { gt: Date } }; data: Partial<OfficeTask> }) => { count: number }>(),
    findFirstOrThrow: vi.fn<() => OfficeTask | null>(),
  },
  officeActionEvent: { create: vi.fn<(args: { data: Prisma.OfficeActionEventUncheckedCreateInput }) => Prisma.OfficeActionEventUncheckedCreateInput>() },
  ownerSaleProposal: { findFirst: vi.fn<(args: { where: { id: number; ownerId: number } }) => Promise<unknown>>() },
  distributionPayout: { findMany: vi.fn<(args: { where: Prisma.DistributionPayoutWhereInput }) => Promise<unknown[]>>() },
  shareLedgerEntry: { findMany: vi.fn<(args: { where: Prisma.ShareLedgerEntryWhereInput }) => Promise<unknown[]>>() },
  journalLine: { findMany: vi.fn<(args: { where: Prisma.JournalLineWhereInput }) => Promise<unknown[]>>() },
  legalDocument: { findMany: vi.fn<(args: { where: Prisma.LegalDocumentWhereInput }) => Promise<unknown[]>>() },
}));
vi.mock("~/server/db", () => ({ db: { ...mock, $transaction: async (run: (tx: typeof mock) => Promise<unknown>) => {
  const task = structuredClone(mock.task), events = [...mock.events];
  try { return await run(mock); } catch (error) { mock.task = task; mock.events = events; throw error; }
} } }));
import { approveOfficeTask, cancelOfficeTask, prepareOfficeTask } from "./tasks";
const user = { id: 1, role: "INVESTOR", status: "ACTIVE" } as const;
const now = new Date("2026-11-04T13:00:00Z");
const reminder = { kind: "REMINDER", title: "Review records", parameters: { dueAt: "2026-11-05T13:00:00Z" } } as const;

beforeEach(() => {
  vi.clearAllMocks(); mock.task = null; mock.events = []; mock.cas = 1;
  mock.officeTask.findFirst.mockImplementation(({ where }) => mock.task && mock.task.id === where.id && mock.task.userId === where.userId ? structuredClone(mock.task) : null);
  mock.officeTask.findFirstOrThrow.mockImplementation(() => structuredClone(mock.task));
  mock.officeTask.create.mockImplementation(({ data }) => { mock.task = { approvedAt: null, completedAt: null, createdAt: now, updatedAt: now, ...data }; return structuredClone(mock.task); });
  mock.officeTask.updateMany.mockImplementation(({ where, data }) => {
    if (mock.cas !== 1 || !mock.task || mock.task.status !== where.status || mock.task.userId !== where.userId) return { count: 0 };
    Object.assign(mock.task, data); return { count: 1 };
  });
  mock.officeActionEvent.create.mockImplementation(({ data }) => { mock.events.push(data); return data; });
  mock.ownerSaleProposal.findFirst.mockResolvedValue(null);
  for (const delegate of [mock.distributionPayout, mock.shareLedgerEntry, mock.journalLine, mock.legalDocument]) delegate.findMany.mockResolvedValue([]);
});

describe("frozen office task transactions", () => {
  it("prepares an exact preview and event, schedules only after explicit approval", async () => {
    const prepared = await prepareOfficeTask(user, reminder, now);
    expect(prepared.status).toBe("PREPARED");
    expect(prepared.expiresAt.getTime() - now.getTime()).toBe(30 * 60000);
    const approved = await approveOfficeTask(user, prepared.id, prepared.approvalDigest, now);
    expect(approved.status).toBe("SCHEDULED");
    expect(approved.result).toEqual(prepared.result);
    expect(approved.parameters).toEqual(reminder.parameters);
    expect(mock.events).toHaveLength(2);
    expect(mock.officeTask.updateMany.mock.calls[0]![0].where).toMatchObject({ userId: 1, status: "PREPARED", expiresAt: { gt: now } });
    expect(mock.officeTask.updateMany.mock.calls[0]![0].where).toMatchObject({
      title: prepared.title, kind: prepared.kind, updatedAt: prepared.updatedAt,
      parameters: { equals: prepared.parameters }, result: { equals: prepared.result },
      expiresAt: { equals: prepared.expiresAt },
    });
  });
  it("hides foreign task IDs including from staff", async () => {
    const task = await prepareOfficeTask(user, reminder, now);
    const foreign = { id: 2, role: "ADMIN", status: "ACTIVE" } as const;
    await expect(approveOfficeTask(foreign, task.id, task.approvalDigest, now)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(cancelOfficeTask(foreign, task.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mock.officeTask.updateMany).not.toHaveBeenCalled();
  });
  it("rejects wrong approval and server-side preview/title tampering", async () => {
    const task = await prepareOfficeTask(user, reminder, now);
    await expect(approveOfficeTask(user, task.id, "0".repeat(64), now)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    mock.task!.title = "Changed";
    await expect(approveOfficeTask(user, task.id, task.approvalDigest, now)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mock.officeTask.updateMany).not.toHaveBeenCalled();
  });
  it("rejects replay and exact expiry boundary", async () => {
    const task = await prepareOfficeTask(user, reminder, now);
    await expect(approveOfficeTask(user, task.id, task.approvalDigest, task.expiresAt)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await approveOfficeTask(user, task.id, task.approvalDigest, now);
    await expect(approveOfficeTask(user, task.id, task.approvalDigest, now)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mock.events).toHaveLength(2);
  });
  it("CAS loss appends no approval/cancel event and event failure rolls state back", async () => {
    const task = await prepareOfficeTask(user, reminder, now);
    mock.cas = 0;
    await expect(approveOfficeTask(user, task.id, task.approvalDigest, now)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(cancelOfficeTask(user, task.id)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mock.events).toHaveLength(1); expect(mock.task!.status).toBe("PREPARED");
    mock.cas = 1; mock.officeActionEvent.create.mockRejectedValueOnce(new Error("event write failed"));
    await expect(approveOfficeTask(user, task.id, task.approvalDigest, now)).rejects.toThrow("event write failed");
    expect(mock.task!.status).toBe("PREPARED");
  });
  it.each([false, true])("cancels PREPARED/SCHEDULED (%s) once only", async (scheduled) => {
    const task = await prepareOfficeTask(user, reminder, now);
    if (scheduled) await approveOfficeTask(user, task.id, task.approvalDigest, now);
    expect((await cancelOfficeTask(user, task.id)).status).toBe("CANCELLED");
    await expect(cancelOfficeTask(user, task.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(approveOfficeTask(user, task.id, task.approvalDigest, now)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("freezes own platform accountant pack with half-open queries and exact cents", async () => {
    mock.distributionPayout.findMany.mockResolvedValue([{ id: 3, grossAmount: 0.1, netAmount: 0.08, taxWithheld: 0.02, paidAt: new Date("2024-02-29T12:00:00Z"), distribution: { propertyId: 9, taxClassification: "UNCLASSIFIED" } }]);
    const task = await prepareOfficeTask(user, { kind: "ACCOUNTANT_PACK", title: "2024 pack", parameters: { taxYear: 2024 } }, now);
    expect(mock.distributionPayout.findMany.mock.calls[0]![0].where).toMatchObject({ investorId: 1, status: "PAID", paidAt: { gte: new Date("2023-03-01"), lt: new Date("2024-03-01") } });
    expect(mock.shareLedgerEntry.findMany.mock.calls[0]![0].where.investorId).toBe(1);
    expect(mock.journalLine.findMany.mock.calls[0]![0].where.investorId).toBe(1);
    expect(mock.legalDocument.findMany.mock.calls[0]![0].where).toEqual({ generatedFor: 1 });
    expect(task.result).toMatchObject({ payouts: [{ grossCents: 10, netCents: 8, withheldCents: 2 }] });
    vi.clearAllMocks();
    const approved = await approveOfficeTask(user, task.id, task.approvalDigest, now);
    expect(approved.status).toBe("COMPLETED"); expect(approved.result).toEqual(task.result);
    expect(mock.distributionPayout.findMany).not.toHaveBeenCalled();
    await expect(cancelOfficeTask(user, task.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("requires server owner role and own proposal, never submits or returns URLs", async () => {
    const input = { kind: "OWNER_CHECKLIST", title: "Documents", parameters: { proposalId: 9 } } as const;
    await expect(prepareOfficeTask(user, input, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const owner = { ...user, role: "PROPERTY_OWNER" } as const;
    await expect(prepareOfficeTask(owner, input, now)).rejects.toMatchObject({ code: "NOT_FOUND" });
    mock.ownerSaleProposal.findFirst.mockResolvedValue({ id: 9, title: "Own", status: "PENDING", documentUrls: [{ kind: "TITLE_DEED", url: "https://private/file" }], bondStatus: "EXISTING", tenancyStatus: "TENANTED" });
    const task = await prepareOfficeTask(owner, input, now);
    expect(mock.ownerSaleProposal.findFirst.mock.calls.at(-1)![0].where).toEqual({ id: 9, ownerId: 1 });
    expect(JSON.stringify(task.result)).not.toContain("https://private");
    const checklist = (task.result as { checklist: { documentType: string; recorded: boolean }[] }).checklist;
    expect(checklist.find((item) => item.documentType === "LEASE")?.recorded).toBe(false);
    expect(checklist.find((item) => item.documentType === "TITLE_DEED")?.recorded).toBe(true);
  });
});