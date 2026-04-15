---
"@vellum-docs/cli": patch
---

Refactor CLI to citty + consola

Replaced hand-rolled argv parsing and `console.log` with two unjs libraries:

- **[citty](https://github.com/unjs/citty)** drives argument parsing, subcommand routing, and help generation. `vellum --help` and `vellum build --help` now produce consistent typed output instead of a static string.
- **[consola](https://github.com/unjs/consola)** handles every user-facing log through a shared tagged logger. Output is color-coded by level (`success`, `info`, `warn`, `error`) with a uniform `[vellum]` prefix.

No breaking CLI surface changes — `vellum build`, `--watch`, `--config`, `--cwd`, `--no-strict` all behave identically. `--no-strict` now comes from citty's boolean-negation convention instead of being parsed by hand.
