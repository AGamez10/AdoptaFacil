import os
"""Person-side flows against TENANT_B (synthetic data): adoption request, donation, volunteer
enrollment, resource offer, sponsorship, contract. IDs appended to evidencia/ids.json."""
import sys
sys.path.insert(0, os.environ.get('AUDIT_DIR', './auditoria-seguridad') + '/scripts')
from seclib import A, call, save, load, short  # noqa: E402

ids = load('ids')
new = {}


def step(tag, res, key=None, path=('id',)):
    st, j = res
    print(f'{tag:30s} {st} {short(j)}')
    if key and isinstance(j, dict):
        v = j
        for p in path:
            v = v.get(p) if isinstance(v, dict) else None
        if v:
            new[key] = v
    return st, j


for who in ('PERSON_P', 'PERSON_Q'):
    step(f'profile {who}', call('PATCH', '/auth/me/profile', who,
                                {'phone': '3000000000', 'documentId': '0000000', 'address': 'Direccion de prueba'}))

step('adoption P->B', call('POST', '/adoptions', 'PERSON_P', {
    'animalId': ids['animal_b'], 'organizationId': A['ORG_B'],
    'animalSnapshot': {'animalId': ids['animal_b'], 'name': 'AnimalB', 'species': 'dog'},
    'applicant': {'fullName': 'Persona Adoptante', 'email': 'person.p@people.test', 'phone': '3000000000'},
    'message': 'Quiero adoptar a este animal, tengo patio y experiencia previa con perros.'}), 'adoption_b')

step('donation P->B', call('POST', '/donations', 'PERSON_P', {
    'organizationId': A['ORG_B'], 'intendedAmount': 50000, 'commissionPayer': 'donor',
    'idempotencyKey': 'sec-audit-donation-p-b-1',
    'payer': {'fullName': 'Persona Adoptante', 'email': 'person.p@people.test'}}), 'donation_b')

step('enroll P->B', call('POST', '/volunteer-enrollments', 'PERSON_P', {'opportunityId': ids['vopp_b']}), 'enroll_b')
step('offer P->B', call('POST', '/resources/offers', 'PERSON_P', {'needId': ids['need_b'], 'quantityOffered': 2}), 'offer_b')
step('sponsor P->B', call('POST', '/sponsorships', 'PERSON_P', {'planId': ids['plan_b']}), 'sponsorship_b')

# Org B moves adoption to approved to allow a contract
if 'adoption_b' in new:
    for target in ('in_review', 'approved'):
        step(f'adoption -> {target}', call('POST', f"/adoptions/{new['adoption_b']}/transitions", 'OWNER_B',
                                           {'targetStatus': target}))
    st, j = step('contract B', call('POST', '/adoptions/contracts', 'OWNER_B', {'requestId': new['adoption_b']}), 'contract_b')
if 'enroll_b' in new:
    step('enroll accept', call('POST', f"/volunteer-enrollments/{new['enroll_b']}/decision", 'OWNER_B', {'decision': 'accept'}))

save('ids', new)
print(new)
