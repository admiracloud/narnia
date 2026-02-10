# Alumna changelog

## 0.4.1 - 2026-02-10

* Fixed `narnia install` to not run the check of installation on the `install` command itself

## 0.4.0 - 2026-02-02

* Check proxies' SSL with `narnia ssl:check`
* Auto renew proxies' SSL with `narnia ssl:renew`
* Changed `narnia ssl <domain> --generate` to `narnia ssl:generate <domain>`
* Ensure narnia has its config folders in every cli call

## 0.3.0 - 2026-01-14

* Allowing multiple templates and adding `--template <template>` flag to CLI