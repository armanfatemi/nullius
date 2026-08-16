#!/usr/bin/env node
// The CLI module runs on import (it ends in `process.exit(main())`), so the
// import IS the invocation. Argument parsing reads process.argv directly, which
// is already correct for this process.
import "@nullius-inverba/claims/cli";
