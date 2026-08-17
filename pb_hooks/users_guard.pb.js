/// <reference path="../pb_data/types.d.ts" />
//
// pb_hooks/users_guard.pb.js — fachliche Invarianten für die users-Collection (WV-11)
// AI-generated: WV-11
//
// Die API-Rules geben role=admin generisches User-CRUD — damit konnte ein App-Admin
// weitere Admins erzeugen, Benutzer in fremde Mandanten umhängen oder sich selbst einen
// Tenant zuweisen (SuperChat-Impersonation, dort zusätzlich per role=customer dicht).
// Diese Request-Hooks ziehen die Grenzen serverseitig; der Superuser (_superusers)
// bleibt uneingeschränkt (Setup-Skripte, Tests, kontrolliertes Reparenting).
//
// Gilt für die Collection-REST-API. Die Admin-Routen aus tenant_admin.pb.js (WV-9)
// schreiben programmatisch und erzwingen dieselben Invarianten selbst.

onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  if (e.record.get("role") !== "customer") throw new ForbiddenError("Neue Zugänge müssen role=customer haben — Admin-Zugänge legt nur der Superuser an.");
  if (!e.record.get("tenant")) throw new BadRequestError("Neue Kunden-Zugänge brauchen einen Mandanten (tenant).");
  e.next();
}, "users");

onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  const orig = e.record.original();
  if (e.record.get("role") !== orig.get("role")) throw new ForbiddenError("Die Rolle eines Zugangs lässt sich nicht ändern.");
  if (e.record.get("tenant") !== orig.get("tenant")) throw new ForbiddenError("Der Mandant eines Zugangs lässt sich nicht umhängen (Reparenting nur via Superuser).");
  e.next();
}, "users");

onRecordDeleteRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  if (e.record.get("role") === "admin") throw new ForbiddenError("Admin-Zugänge löscht nur der Superuser.");
  e.next();
}, "users");
