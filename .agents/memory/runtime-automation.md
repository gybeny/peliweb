---
name: Runtime automation requirement
description: The user's requirement for automatic startup and configuration rather than manual config editing.
---

„nem szeretném hogy bárhogy is hozzá kéne nyúlni, teljesen automatizált legyen, müködjön első kattintásra. a configot és mindent, csinálja a script, és lehessen konfigurálni szinte mindent.”

**Why:** The user explicitly rejected manually maintaining nginx/PHP configuration after encountering a runtime startup failure.

**How to apply:** Generate and validate managed configuration automatically, expose supported settings through Pelican, and automate install/update steps. Be explicit about any administrator-only prerequisite that cannot be automated from an unprivileged website container; never imply that host Docker access or image publication happens automatically when it does not.
