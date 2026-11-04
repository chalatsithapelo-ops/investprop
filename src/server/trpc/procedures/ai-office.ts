import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { loadOfficeContext, sourceMetadataSelect } from "~/server/office/context";
import { assertOfficeUser, HISTORY_LIMIT, OFFICE_LIMIT, personas, taskKinds, parametersSchema } from "~/server/office/policy";
import { chatOffice, ownConversation } from "~/server/office/chat";
import { prepareOfficeTask, approveOfficeTask, cancelOfficeTask } from "~/server/office/tasks";
import { createOfficeTaxSource, publishOfficeTaxSource, taxSourceDraftSchema } from "~/server/office/sources";

const auth = z.object({ authToken: z.string().min(1).max(8192) }).strict();
const id = z.string().min(1).max(128);
async function userFor(authToken: string) {
  const user = await getAuthenticatedUser(authToken);
  assertOfficeUser(user);
  return user;
}

export const officeOverview = baseProcedure.input(auth).query(async ({ input }) =>
  (await loadOfficeContext(await userFor(input.authToken))).overview);

export const officeConversations = baseProcedure.input(auth).query(async ({ input }) => {
  const user = await userFor(input.authToken);
  return db.officeConversation.findMany({ where: { userId: user.id },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: OFFICE_LIMIT });
});

export const officeConversation = baseProcedure.input(auth.extend({ conversationId: id })).query(async ({ input }) => {
  const user = await userFor(input.authToken);
  const conversation = await ownConversation(user.id, input.conversationId);
  const rows = await db.officeMessage.findMany({ where: { conversationId: conversation.id, conversation: { userId: user.id } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: HISTORY_LIMIT + 1 });
  return { ...conversation, messages: rows.slice(0, HISTORY_LIMIT).reverse(), truncated: rows.length > HISTORY_LIMIT };
});

export const officeChat = baseProcedure.input(auth.extend({ conversationId: id.optional(), persona: personas,
  message: z.string().trim().min(1).max(2000) })).mutation(async ({ input }) => chatOffice(await userFor(input.authToken), input));

export const officeTasks = baseProcedure.input(auth).query(async ({ input }) => {
  const user = await userFor(input.authToken);
  return db.officeTask.findMany({ where: { userId: user.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: OFFICE_LIMIT });
});

export const officePrepareTask = baseProcedure.input(auth.extend({ kind: taskKinds, title: z.string().trim().min(1).max(160), parameters: parametersSchema }))
  .mutation(async ({ input }) => prepareOfficeTask(await userFor(input.authToken), input));

export const officeApproveTask = baseProcedure.input(auth.extend({ taskId: id, approvalDigest: z.string().regex(/^[a-f0-9]{64}$/) }))
  .mutation(async ({ input }) => approveOfficeTask(await userFor(input.authToken), input.taskId, input.approvalDigest));

export const officeCancelTask = baseProcedure.input(auth.extend({ taskId: id }))
  .mutation(async ({ input }) => cancelOfficeTask(await userFor(input.authToken), input.taskId));

export const officeTaxSources = baseProcedure.input(auth).query(async ({ input }) => {
  const user = await userFor(input.authToken);
  // Metadata only; status is visible even for future/expired reviewed material.
  return db.officeTaxSource.findMany({ where: user.role === "ADMIN" ? {} : { status: "APPROVED", reviewedAt: { not: null } },
    select: sourceMetadataSelect, orderBy: [{ effectiveFrom: "desc" }, { id: "asc" }], take: OFFICE_LIMIT });
});

export const officeCreateTaxSource = baseProcedure.input(auth.merge(taxSourceDraftSchema).strict())
  .mutation(async ({ input: { authToken, ...draft } }) => createOfficeTaxSource(await userFor(authToken), draft));

export const officePublishTaxSource = baseProcedure.input(auth.extend({ sourceId: id, version: z.number().int().positive(),
  reviewDigest: z.string().regex(/^[a-f0-9]{64}$/), reviewedPublishAttestation: z.literal(true) }))
  .mutation(async ({ input }) => publishOfficeTaxSource(await userFor(input.authToken), input));