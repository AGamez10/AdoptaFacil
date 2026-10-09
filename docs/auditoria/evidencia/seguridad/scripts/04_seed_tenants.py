import os
"""Seed synthetic business objects in TENANT_A and TENANT_B through the HTTP API.
All values are obviously synthetic test placeholders. IDs -> evidencia/ids.json."""
import sys
sys.path.insert(0, os.environ.get('AUDIT_DIR', './auditoria-seguridad') + '/scripts')
from seclib import call, save, short  # noqa: E402

ids = {}


def step(tag, res, key=None, field='id'):
    st, j = res
    print(f'{tag:28s} {st} {short(j)}')
    if key and isinstance(j, dict) and field in j:
        ids[key] = j[field]
    return j


for T, OWN in (('A', 'OWNER_A'), ('B', 'OWNER_B')):
    t = T.lower()
    step(f'profile {T}', call('PUT', '/org/profile', OWN, {
        'slug': f'refugio-{t}', 'subdomain': f'refugio-{t}',
        'description': f'Organizacion de prueba {T}',
        'contactEmail': f'contacto@tenant-{t}.test'}))
    step(f'animal {T}', call('POST', '/animals', OWN, {
        'name': f'Animal{T}', 'species': 'dog', 'sex': 'male', 'size': 'small',
        'status': 'available', 'description': 'test'}), f'animal_{t}')
    step(f'clinical {T}', call('POST', f"/animals/{ids.get(f'animal_{t}')}/clinical-events", OWN, {
        'type': 'vaccine', 'occurredAt': '2026-09-01T10:00:00Z',
        'details': {'note': f'CLINICAL-SECRET-{T}'}}), f'clinical_{t}')
    step(f'campaign {T}', call('POST', '/campaigns', OWN, {
        'title': f'Campana {T}', 'category': 'food', 'goalAmount': 1000000,
        'deadline': '2027-01-01T00:00:00Z'}), f'campaign_{t}')
    step(f'document {T}', call('POST', '/org/documents', OWN, {
        'type': 'rut', 'filename': f'rut-{t}.pdf', 'contentType': 'application/pdf'}), f'document_{t}')
    step(f'plan {T}', call('POST', '/sponsorship-plans', OWN, {
        'animalId': ids.get(f'animal_{t}'), 'name': f'Plan {T}', 'amount': 20000,
        'periodicity': 'monthly'}), f'plan_{t}')
    step(f'volunteer opp {T}', call('POST', '/volunteer-opportunities', OWN, {
        'title': f'Voluntariado {T}', 'category': 'general', 'location': 'Bogota',
        'startDate': '2026-11-01T10:00:00Z', 'endDate': '2026-11-02T10:00:00Z'}), f'vopp_{t}')
    step(f'resource need {T}', call('POST', '/resources/needs', OWN, {
        'title': f'Necesidad {T}', 'category': 'food', 'quantityNeeded': 10, 'unit': 'kg'}), f'need_{t}')
    step(f'product {T}', call('POST', '/marketplace/products', OWN, {
        'name': f'Producto {T}', 'category': 'food', 'price': 10000, 'stock': 5}), f'product_{t}')
    step(f'evidence {T}', call('POST', f"/campaigns/{ids.get(f'campaign_{t}')}/evidences", OWN, {
        'type': 'invoice', 'concept': 'compra', 'amount': 1000, 'spentAt': '2026-09-02T10:00:00Z',
        'filename': 'factura.pdf', 'contentType': 'application/pdf'}), f'evidence_{t}')
    step(f'bank acct {T}', call('PUT', '/org/payout-bank-account', OWN, {
        'bankCode': '0001', 'accountType': 'savings', 'accountNumber': f'0000000000{t}1'[:12],
        'accountHolderName': f'Titular Prueba {T}', 'accountHolderDocument': '000000000'}))

save('ids', ids)
print(ids)
