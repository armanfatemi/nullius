export {
  parseClaims,
  parsePresenceMarker,
  rewriteMarker,
  type AbsenceClaim,
  type CanaryClaim,
  type Claim,
  type MalformedClaim,
  type MomentClaim,
  type PresenceClaim,
  type PresenceMarker,
  type SourceLocation,
} from "./parseClaims";
export {
  planRewrites,
  type Rewrite,
  type RewriteIntent,
  type RewritePlan,
  type Skipped,
  type StampCheck,
} from "./rewrite";
export {
  checkClaims,
  isFailure,
  normalize,
  verifyAtRev,
  DEFAULT_BINDING_MOMENTS,
  type RevVerification,
  type CheckDeps,
  type CheckOptions,
  type ClaimResult,
  type RevRead,
  type SearchOutcome,
  type Verdict,
} from "./checkClaims";
export {
  canaryGuardResult,
  clearCanary,
  loadActiveCanary,
  normalizeRepoPath,
  plantCanary,
  verifyCanary,
  type CanaryEntry,
  type VerifyOutcome,
} from "./canary";
export { buildEagerPrompt } from "./eagerPrompt";
export {
  buildAuditBrief,
  buildComplianceBrief,
  buildExtractionBrief,
  extractAuditClaims,
  formatAuditPlan,
  type AuditClaim,
  type ComplianceRule,
} from "./audit";
export {
  isJournalFailure,
  surveyJournals,
  validateJournal,
  // v0.6. The schema's closed vocabularies, named here so a producer can refuse
  // a bad value BEFORE it appends rather than learning about it from the next
  // `validate`. They are the definition the validator enforces, so a second
  // copy in the producer is drift by construction — and drift in the direction
  // no test can see, since a copy silently refuses a member the kernel added.
  // `VERSIONS` stays out of this list on the opposite reasoning: it is exported
  // from `witness.ts` only for a unit test, and a caller that compares versions
  // itself is the second copy of a floor this kernel decides once.
  CHECK_OUTCOMES,
  RESOLUTION_OUTCOMES,
  SEVERITIES,
  TERMINAL_RECORD_KINDS,
  type JournalFinding,
  type JournalHeader,
  type JournalOrigin,
  type JournalReport,
  type JournalSurvey,
  type JournalVerdict,
  // v0.6. `JournalReport` and `JournalSurvey` are already public and both now
  // reference these, so a consumer that cannot name them cannot write a type
  // annotation for a field it can already read.
  type LedgerCounts,
  type ProvenanceCounts,
  type SurveyedJournal,
} from "./witness";
export {
  checkRuleCoverage,
  isRuleCoverageFailure,
  type RuleCoverageFinding,
  type RuleCoverageVerdict,
} from "./ruleCoverage";
export { isSafeRepoPath, type PathVerdict } from "./pathSafety";
export {
  isSafeSearchCommand,
  parseSearchCommand,
  reachabilityPlan,
  DENIED_FLAG_TABLES,
  FLAG_ARITY_TABLES,
  type Arity,
  type ParseResult,
  type SafetyVerdict,
  type SearchBinary,
  type SearchPlan,
  type SearchSegment,
} from "./commandSafety";
export {
  fileLinesReader,
  headRev,
  revFileReader,
  searchRunner,
  containPath,
  resolveInsideRoot,
  DEFAULT_SEARCH_TIMEOUT_MS,
  DEFAULT_RUN_BUDGET_MS,
  DEFAULT_GIT_TIMEOUT_MS,
  type Containment,
} from "./runners";
export { parseConfig, type ClaimsConfig } from "./config";
export {
  checkWiring,
  hookTarget,
  isWiringFailure,
  type ArtifactKind,
  type HarnessArtifact,
  type WiringDeps,
  type WiringFinding,
  type WiringReport,
  type WiringVerdict,
} from "./wiring";
export { fsWiringDeps, looseCandidates, scanHarnessRoot } from "./wiringScan";
export {
  parseFrontmatter,
  declaredList,
  type Frontmatter,
  type Located,
} from "./frontmatter";
export {
  appliesToMatches,
  checkRule,
  isRuleFailure,
  parseRuleHeader,
  selectRules,
  type MalformedRuleHeader,
  type ParsedRuleHeader,
  type RuleCheckResult,
  type RuleFile,
  type RuleHeaderResult,
  type RuleSelection,
  type RuleSeverity,
  type RuleVerdict,
  type SelectRulesResult,
} from "./rules";
export { scanRules } from "./rulesScan";
