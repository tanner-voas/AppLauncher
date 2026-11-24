# AppLauncher v0.1.15

- New information button on the workspace header opens the offline package-version tree, including exact pinned commits.
- Build derives nested package versions independently from the checked-out Git links; repeated library names are not collapsed.
- The existing strict release policy still requires the launcher and Ciyan profile libraries to match. No release-coordination or cloud changes.
- The release manifest and offline launcher metadata carry the same validated tree. No live requests or account access are required.
