import { z } from "zod";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { requireFeature } from "~/server/subscriptions/subscription-service";
import { assertOfficeUser } from "~/server/office/policy";
import { loadPropertyScenario, loadAccountingExceptions, scenarioAssumptionsSchema } from "~/server/office/scenarios";

const auth = z.object({ authToken: z.string().min(1).max(8192) }).strict();
async function scenarioUser(authToken: string) {
  const user = await getAuthenticatedUser(authToken);
  assertOfficeUser(user);
  await requireFeature(user, user.role === "PROPERTY_OWNER" ? "SELLER_AI_VALUATION" : "AI_COPILOT");
  return user;
}

/** Read-only exports; intentionally not registered in root by this additive change. */
export const officePropertyScenario = baseProcedure.input(auth.extend({
  propertyId: z.number().int().positive(), assumptions: scenarioAssumptionsSchema,
})).query(async ({ input }) => loadPropertyScenario(await scenarioUser(input.authToken), input.propertyId, input.assumptions));

export const officeAccountingExceptions = baseProcedure.input(auth).query(async ({ input }) =>
  loadAccountingExceptions(await scenarioUser(input.authToken)));