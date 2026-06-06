import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BadgeDollarSign, Vote, Clock, CheckCircle, XCircle, Plus, ThumbsUp, ThumbsDown } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

export const Route = createFileRoute("/distributions/")({
  component: DistributionsPage,
});

function DistributionsPage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [tab, setTab] = useState<"distributions" | "governance">("distributions");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ propertyId: 0, totalAmount: 0, description: "" });
  const [votingId, setVotingId] = useState<number | null>(null);
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [proposalForm, setProposalForm] = useState({ propertyId: 0, title: "", description: "", proposalType: "OTHER" as string, deadline: "" });
  const [executing, setExecuting] = useState<number | null>(null);

  const isManager = user?.role === "DEVELOPMENT_MANAGER" || user?.role === "PROPERTY_OWNER";

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const distributionsQuery = useQuery({
    ...trpc.getDistributions.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isManager,
  });

  const myDistributionsQuery = useQuery({
    ...trpc.getMyDistributions.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
  });

  const proposalsQuery = useQuery({
    ...trpc.getProposals.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
  });

  const propertiesQuery = useQuery({
    ...trpc.getProperties.queryOptions({ limit: 100 }),
    enabled: !!authToken,
  });
  const propertiesArr = ((propertiesQuery.data as any)?.properties ?? []) as any[];

  const allDistributions = (distributionsQuery.data as any)?.distributions ?? distributionsQuery.data ?? [];
  const myDistData = myDistributionsQuery.data as any;
  const myPayouts = (myDistData?.payouts ?? []) as any[];
  // Normalise investor payouts to match distribution shape for rendering
  const myDistributions = myPayouts.map((p: any) => ({
    id: p.id,
    description: p.distribution?.description ?? `Distribution from ${p.distribution?.property?.title ?? 'Property'}`,
    propertyTitle: p.distribution?.property?.title ?? '',
    createdAt: p.createdAt,
    totalAmount: p.netAmount,
    amount: p.netAmount,
    status: p.status === 'PAID' ? 'EXECUTED' : p.status,
  }));
  const proposals = (proposalsQuery.data as any)?.proposals ?? proposalsQuery.data ?? [];

  const distributionsArr = Array.isArray(isManager ? allDistributions : myDistributions) ? (isManager ? allDistributions : myDistributions) : [];
  const proposalsArr = Array.isArray(proposals) ? proposals : [];

  const handleCreateDistribution = async () => {
    try {
      await trpcClient.createDistribution.mutate({
        authToken: authToken ?? "",
        propertyId: createForm.propertyId,
        totalAmount: createForm.totalAmount,
        description: createForm.description,
      });
      toast.success("Distribution created successfully");
      queryClient.invalidateQueries({ queryKey: trpc.getDistributions.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.getMyDistributions.queryKey() });
      setShowCreateForm(false);
      setCreateForm({ propertyId: 0, totalAmount: 0, description: "" });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create distribution");
    }
  };

  const handleExecuteDistribution = async (distributionId: number) => {
    setExecuting(distributionId);
    try {
      await trpcClient.executeDistribution.mutate({ authToken: authToken ?? "", distributionId });
      toast.success("Distribution executed — payouts sent");
      queryClient.invalidateQueries({ queryKey: trpc.getDistributions.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.getMyDistributions.queryKey() });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to execute distribution");
    } finally {
      setExecuting(null);
    }
  };

  const handleCreateProposal = async () => {
    if (!proposalForm.propertyId || !proposalForm.title || !proposalForm.description || !proposalForm.deadline) { toast.error("Please fill all required fields"); return; }
    try {
      await trpcClient.createProposal.mutate({
        authToken: authToken ?? "",
        propertyId: proposalForm.propertyId,
        title: proposalForm.title,
        description: proposalForm.description,
        proposalType: proposalForm.proposalType as any,
        deadline: new Date(proposalForm.deadline).toISOString(),
      });
      toast.success("Proposal created");
      setShowProposalForm(false);
      setProposalForm({ propertyId: 0, title: "", description: "", proposalType: "OTHER", deadline: "" });
      queryClient.invalidateQueries({ queryKey: trpc.getProposals.queryKey() });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create proposal");
    }
  };

  const handleCloseProposal = async (proposalId: number) => {
    try {
      await trpcClient.closeProposal.mutate({ authToken: authToken ?? "", proposalId });
      toast.success("Proposal closed");
      queryClient.invalidateQueries({ queryKey: trpc.getProposals.queryKey() });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to close proposal");
    }
  };

  const handleVote = async (proposalId: number, support: boolean) => {
    try {
      await trpcClient.castVote.mutate({
        authToken: authToken ?? "",
        proposalId,
        support,
      });
      toast.success(`Vote cast: ${support ? "For" : "Against"}`);
      queryClient.invalidateQueries({ queryKey: trpc.getProposals.queryKey() });
      setVotingId(null);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to cast vote");
    }
  };

  if (!user || !authToken) return null;

  const isLoading = distributionsQuery.isLoading || myDistributionsQuery.isLoading || proposalsQuery.isLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold-500 border-r-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BadgeDollarSign className="text-gold-600" size={32} />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Distributions & Governance</h1>
              <p className="mt-1 text-gray-500">Manage distributions and vote on proposals</p>
            </div>
          </div>
          {isManager && tab === "distributions" && (
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600"
            >
              <Plus size={18} /> Create Distribution
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-lg bg-navy-900/50 p-1">
          <button
            onClick={() => setTab("distributions")}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === "distributions"
                ? "bg-gold-500 text-white"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <BadgeDollarSign size={16} /> Distributions
          </button>
          <button
            onClick={() => setTab("governance")}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === "governance"
                ? "bg-gold-500 text-white"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <Vote size={16} /> Governance
          </button>
        </div>

        {/* Create Distribution Form */}
        {showCreateForm && tab === "distributions" && isManager && (
          <div className="mb-6 rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">New Distribution</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Property</label>
                <select
                  value={createForm.propertyId || ""}
                  onChange={(e) => setCreateForm({ ...createForm, propertyId: Number(e.target.value) })}
                  className="w-full rounded-lg border border-navy-700 bg-navy-800/50 px-4 py-2.5 text-gray-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20"
                >
                  <option value="">Select Property</option>
                  {propertiesArr.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Total Amount (R)</label>
                <input
                  type="number"
                  value={createForm.totalAmount || ""}
                  onChange={(e) => setCreateForm({ ...createForm, totalAmount: Number(e.target.value) })}
                  className="w-full rounded-lg border border-navy-700 bg-navy-800/50 px-4 py-2.5 text-gray-900 placeholder-gray-500 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Description</label>
                <input
                  type="text"
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full rounded-lg border border-navy-700 bg-navy-800/50 px-4 py-2.5 text-gray-900 placeholder-gray-500 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20"
                  placeholder="Q4 rental distribution"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <button
                onClick={handleCreateDistribution}
                disabled={!createForm.propertyId || !createForm.totalAmount}
                className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600 disabled:opacity-50"
              >
                Create Distribution
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                className="rounded-lg border border-navy-700 px-4 py-2 text-sm text-gray-600 hover:bg-navy-800/30"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Distributions Tab */}
        {tab === "distributions" && (
          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
            <div className="mb-4 flex items-center gap-2">
              <BadgeDollarSign className="text-gold-600" size={20} />
              <h2 className="text-lg font-semibold text-gray-900">
                {isManager ? "All Distributions" : "My Distributions"}
              </h2>
            </div>

            {distributionsArr.length === 0 ? (
              <div className="py-8 text-center">
                <BadgeDollarSign className="mx-auto mb-3 text-gray-600" size={40} />
                <p className="text-gray-500">No distributions found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {distributionsArr.map((dist: any, idx: number) => (
                  <div
                    key={dist.id ?? idx}
                    className="flex items-center justify-between rounded-lg border border-navy-700 bg-navy-800/50 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`rounded-lg p-2 ${
                          dist.status === "EXECUTED"
                            ? "bg-emerald-50"
                            : "bg-gold-50"
                        }`}
                      >
                        {dist.status === "EXECUTED" ? (
                          <CheckCircle className="text-emerald-600" size={20} />
                        ) : (
                          <Clock className="text-gold-600" size={20} />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {dist.description ?? dist.propertyTitle ?? `Distribution #${dist.id}`}
                        </p>
                        <p className="text-sm text-gray-500">
                          {dist.createdAt
                            ? new Date(dist.createdAt).toLocaleDateString("en-ZA")
                            : ""}
                          {dist.propertyTitle ? ` · ${dist.propertyTitle}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900">
                        R{Number(dist.totalAmount ?? dist.amount ?? 0).toLocaleString()}
                      </p>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          dist.status === "EXECUTED"
                            ? "bg-emerald-50 text-emerald-600"
                            : dist.status === "PENDING"
                              ? "bg-gold-50 text-gold-600"
                              : dist.status === "APPROVED"
                                ? "bg-blue-50 text-blue-600"
                                : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {dist.status === "EXECUTED"
                          ? (isManager ? "Paid out" : "Paid to your bank")
                          : dist.status === "PENDING"
                            ? "Awaiting approval"
                            : dist.status === "APPROVED"
                              ? "Approved — payout pending"
                              : dist.status === "PAID"
                                ? "Paid to your bank"
                                : dist.status === "HELD_FOR_TAX"
                                  ? "Held for tax"
                                  : dist.status === "REINVESTED"
                                    ? "Reinvested"
                                    : dist.status ?? "Pending"}
                      </span>
                      {isManager && dist.status === "APPROVED" && (
                        <button
                          onClick={() => handleExecuteDistribution(dist.id)}
                          disabled={executing === dist.id}
                          className="mt-1 rounded-lg bg-emerald-500 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                        >
                          {executing === dist.id ? "Executing..." : "Execute"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Governance Tab */}
        {tab === "governance" && (
          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Vote className="text-gold-600" size={20} />
                <h2 className="text-lg font-semibold text-gray-900">Governance Proposals</h2>
              </div>
              <button onClick={() => setShowProposalForm(!showProposalForm)} className="flex items-center gap-2 rounded-lg bg-gold-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-gold-600">
                <Plus size={16} /> New Proposal
              </button>
            </div>

            {/* Create Proposal Form */}
            {showProposalForm && (
              <div className="mb-6 rounded-lg border border-gold-300 bg-white p-5">
                <h3 className="mb-3 font-semibold text-gray-900">Create Proposal</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Property</label>
                    <select value={proposalForm.propertyId || ""} onChange={(e) => setProposalForm({ ...proposalForm, propertyId: Number(e.target.value) })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none">
                      <option value="">Select Property</option>
                      {propertiesArr.map((p: any) => <option key={p.id} value={p.id}>{p.title}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
                    <select value={proposalForm.proposalType} onChange={(e) => setProposalForm({ ...proposalForm, proposalType: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none">
                      <option value="SELL_PROPERTY">Sell Property</option>
                      <option value="RENOVATE">Renovate</option>
                      <option value="CHANGE_TENANT">Change Tenant</option>
                      <option value="CHANGE_MANAGER">Change Manager</option>
                      <option value="DISTRIBUTE">Distribute</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
                    <input value={proposalForm.title} onChange={(e) => setProposalForm({ ...proposalForm, title: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" placeholder="Proposal title" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                    <textarea value={proposalForm.description} onChange={(e) => setProposalForm({ ...proposalForm, description: e.target.value })} rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" placeholder="Describe the proposal..." />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Deadline</label>
                    <input type="date" value={proposalForm.deadline} onChange={(e) => setProposalForm({ ...proposalForm, deadline: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" />
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-3">
                  <button onClick={() => setShowProposalForm(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                  <button onClick={handleCreateProposal} className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-600">Create</button>
                </div>
              </div>
            )}

            {proposalsArr.length === 0 ? (
              <div className="py-8 text-center">
                <Vote className="mx-auto mb-3 text-gray-600" size={40} />
                <p className="text-gray-500">No active proposals</p>
              </div>
            ) : (
              <div className="space-y-4">
                {proposalsArr.map((proposal: any, idx: number) => (
                  <div
                    key={proposal.id ?? idx}
                    className="rounded-lg border border-navy-700 bg-navy-800/50 p-5"
                  >
                    <div className="mb-3 flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {proposal.title ?? `Proposal #${proposal.id}`}
                        </h3>
                        <p className="mt-1 text-sm text-gray-500">
                          {proposal.description ?? "No description provided"}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          proposal.status === "ACTIVE" || proposal.status === "OPEN"
                            ? "bg-emerald-50 text-emerald-600"
                            : proposal.status === "PASSED"
                              ? "bg-blue-50 text-blue-600"
                              : proposal.status === "REJECTED"
                                ? "bg-red-50 text-red-600"
                                : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {proposal.status ?? "ACTIVE"}
                      </span>
                    </div>

                    {/* Vote counts */}
                    <div className="mb-3 flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1 text-emerald-600">
                        <ThumbsUp size={14} />
                        <span>{proposal.votesFor ?? proposal.yesVotes ?? 0} For</span>
                      </div>
                      <div className="flex items-center gap-1 text-red-600">
                        <ThumbsDown size={14} />
                        <span>{proposal.votesAgainst ?? proposal.noVotes ?? 0} Against</span>
                      </div>
                      {proposal.deadline && (
                        <div className="flex items-center gap-1 text-gray-500">
                          <Clock size={14} />
                          <span>Ends {new Date(proposal.deadline).toLocaleDateString("en-ZA")}</span>
                        </div>
                      )}
                    </div>

                    {/* Vote actions */}
                    {(proposal.status === "ACTIVE" || proposal.status === "OPEN") && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleVote(proposal.id, true)}
                          disabled={votingId === proposal.id}
                          className="flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-600 hover:bg-emerald-500/20 disabled:opacity-50"
                        >
                          <ThumbsUp size={14} /> Vote For
                        </button>
                        <button
                          onClick={() => handleVote(proposal.id, false)}
                          disabled={votingId === proposal.id}
                          className="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-500/20 disabled:opacity-50"
                        >
                          <ThumbsDown size={14} /> Vote Against
                        </button>
                        {isManager && (
                          <button
                            onClick={() => handleCloseProposal(proposal.id)}
                            className="ml-auto flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-200"
                          >
                            <XCircle size={14} /> Close Voting
                          </button>
                        )}
                      </div>
                    )}

                    {proposal.status === "PASSED" && (
                      <div className="flex items-center gap-1 text-sm text-blue-600">
                        <CheckCircle size={14} /> Proposal passed
                      </div>
                    )}
                    {proposal.status === "REJECTED" && (
                      <div className="flex items-center gap-1 text-sm text-red-600">
                        <XCircle size={14} /> Proposal rejected
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
