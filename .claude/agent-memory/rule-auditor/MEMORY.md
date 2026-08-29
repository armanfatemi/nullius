# Memory index

- [Proposal-mode scope](feedback_proposal_mode_scope.md) — pull real code paths out of tasks.md too, not just the change-dir files, before picking applicable rules
- [Anchor verification method](feedback_anchor_verification_method.md) — use `awk NR==N` not `sed|cat -n` math; watch for unstamped bare `path:line` citations; `git blame` before calling STALE a repoint violation
- [Canary detection](feedback_canary_detection.md) — run the claims CLI over in-scope docs; it catches planted CANARY-PRESENT probes that Read/grep miss
- [Repoint adjudication](feedback_repoint_adjudication.md) — repoint rule only forbids falsifying a line that WAS true at the stamped hash; fixing a never-verified/never-committed guess isn't the forbidden edit, even though the diff looks identical
