import os
"""BOLA/IDOR matrix: callers from TENANT_A (and an unrelated person Q) against objects of TENANT_B
(and of person P). A response is flagged LEAK when it is 2xx and contains the target id or a
B-only marker. Output: evidencia/06_bola_matrix.csv + .out"""
import csv
import json
import sys
sys.path.insert(0, os.environ.get('AUDIT_DIR', './auditoria-seguridad') + '/scripts')
from seclib import A, SEC, call, load, short  # noqa: E402

I = load('ids')
I.update({
    'document_b': '802bff9a-8502-4110-a0ef-75d7bf3fe1d3',
    'evidence_b': '0c8b984e-a96b-4007-a826-051f49839b48',
    'event_b': 'c12d6cf6-2f37-4501-8193-786dccd67faa',
    'docref_b': 'private/897207c9-7f8a-412a-a008-3ef9eb4bc0a3/39feea6c-abe9-4e95-94bb-b53b2d98f3b8-rut-b.pdf',
    'signer_adopter_b': '26e69d4d-2f5b-4056-a1da-79a6863c8cff',
    'signer_rep_b': '42e384da-92af-4081-a6ef-50aac16dbd89',
})
ORG_B = A['ORG_B']
MARK = [ORG_B, 'Refugio Tenant B', 'CLINICAL-SECRET-B', 'AnimalB', 'Titular Prueba B', 'person.p@people.test']

# (method, path, body)
cases = [
    ('GET', f"/animals/{I['animal_b']}", None),
    ('PATCH', f"/animals/{I['animal_b']}", {'description': 'pwned'}),
    ('POST', f"/animals/{I['animal_b']}/deactivate", {}),
    ('DELETE', f"/animals/{I['animal_b']}", None),
    ('POST', f"/animals/{I['animal_b']}/photos", {'filename': 'x.png'}),
    ('GET', f"/animals/{I['animal_b']}/behavior-disclosures/current", None),
    ('GET', f"/animals/{I['animal_b']}/clinical-events", None),
    ('GET', f"/animals/{I['animal_b']}/clinical-events/carnet", None),
    ('GET', f"/animals/{I['animal_b']}/clinical-events/card", None),
    ('GET', f"/animals/{I['animal_b']}/clinical-events/carnet.pdf", None),
    ('GET', f"/animals/{I['animal_b']}/clinical-events/{I['event_b']}/history", None),
    ('POST', f"/animals/{I['animal_b']}/clinical-events", {'type': 'vaccine', 'occurredAt': '2026-09-01T10:00:00Z'}),
    ('POST', f"/animals/{I['animal_b']}/clinical-events/{I['event_b']}", {'details': {'x': 1}}),
    ('GET', f"/campaigns/{I['campaign_b']}", None),
    ('PATCH', f"/campaigns/{I['campaign_b']}", {'title': 'pwned'}),
    ('GET', f"/campaigns/{I['campaign_b']}/evidences", None),
    ('POST', f"/campaigns/{I['campaign_b']}/evidences", {'type': 'invoice', 'concept': 'x', 'spentAt': '2026-09-02T10:00:00Z', 'filename': 'x.pdf'}),
    ('GET', f"/sponsorship-plans/{I['plan_b']}", None),
    ('PATCH', f"/sponsorship-plans/{I['plan_b']}", {'name': 'pwned'}),
    ('GET', f"/sponsorships/{I['sponsorship_b']}", None),
    ('GET', f"/sponsorships/{I['sponsorship_b']}/history", None),
    ('GET', f"/sponsorships/{I['sponsorship_b']}/payments", None),
    ('POST', f"/sponsorships/{I['sponsorship_b']}/suspend", {}),
    ('POST', f"/sponsorships/{I['sponsorship_b']}/cancel", {}),
    ('POST', f"/sponsorships/{I['sponsorship_b']}/retry-payment", {}),
    ('POST', f"/adoptions/{I['adoption_b']}/transitions", {'targetStatus': 'rejected', 'reason': 'x'}),
    ('GET', f"/adoptions/contracts/by-request/{I['adoption_b']}", None),
    ('GET', f"/adoptions/contracts/org/{I['contract_b']}", None),
    ('GET', f"/adoptions/contracts/{I['contract_b']}", None),
    ('POST', f"/adoptions/contracts/{I['contract_b']}/transitions", {'targetStatus': 'cancelled'}),
    ('PATCH', f"/adoptions/contracts/{I['contract_b']}/data", {'signatureCity': 'pwned'}),
    ('GET', f"/adoptions/contracts/org/{I['contract_b']}/pdf", None),
    ('GET', f"/adoptions/contracts/{I['contract_b']}/pdf", None),
    ('POST', f"/adoptions/contracts/{I['contract_b']}/signatures", {'signerId': I['signer_adopter_b'], 'signatureBase64': 'iVBORw0KGgo='}),
    ('GET', f"/adoptions/contracts/org/{I['contract_b']}/signatures/{I['signer_rep_b']}/image", None),
    ('GET', f"/adoptions/contracts/{I['contract_b']}/signatures/{I['signer_rep_b']}/image", None),
    ('GET', f"/adoptions/followups/by-contract/{I['contract_b']}", None),
    ('POST', '/adoptions/followups', {'contractId': I['contract_b']}),
    ('GET', f"/donations/{I['donation_b']}/receipt", None),
    ('GET', f"/donations/{I['donation_b']}/certificate", None),
    ('POST', f"/donations/{I['donation_b']}/certificate", {}),
    ('GET', f"/resources/needs/{I['need_b']}", None),
    ('PATCH', f"/resources/needs/{I['need_b']}", {'title': 'pwned'}),
    ('PATCH', f"/resources/offers/{I['offer_b']}/decision", {'decision': 'decline'}),
    ('PATCH', f"/resources/offers/{I['offer_b']}/cancel", {}),
    ('GET', f"/resources/offers/{I['offer_b']}/proofs", None),
    ('POST', f"/resources/offers/{I['offer_b']}/proofs", {'filename': 'x.pdf'}),
    ('PATCH', f"/resources/offers/{I['offer_b']}/proof-validation", {'decision': 'approve'}),
    ('GET', f"/marketplace/products/{I['product_b']}", None),
    ('PATCH', f"/marketplace/products/{I['product_b']}", {'name': 'pwned'}),
    ('POST', f"/marketplace/products/{I['product_b']}/images", {'filename': 'x.png'}),
    ('GET', f"/volunteer-opportunities/{I['vopp_b']}", None),
    ('PATCH', f"/volunteer-opportunities/{I['vopp_b']}", {'title': 'pwned'}),
    ('GET', f"/volunteer-enrollments/{I['enroll_b']}", None),
    ('POST', f"/volunteer-enrollments/{I['enroll_b']}/decision", {'decision': 'reject', 'reason': 'x'}),
    ('POST', f"/volunteer-enrollments/{I['enroll_b']}/complete", {}),
    ('GET', f"/service-hours?enrollmentId={I['enroll_b']}", None),
    ('POST', '/service-hours', {'enrollmentId': I['enroll_b'], 'date': '2026-11-01T10:00:00Z', 'hours': 99, 'description': 'x'}),
    ('POST', f"/volunteer-certificates/{I['enroll_b']}", {}),
    ('GET', f"/platform/payouts/{ORG_B}", None),
    ('POST', '/platform/payouts', {'organizationId': ORG_B, 'amount': 1000, 'idempotencyKey': 'sec-audit-payout-1'}),
    ('GET', '/platform/documents/queue', None),
    ('POST', f"/platform/documents/{I['document_b']}/decision", {'decision': 'approve'}),
    ('GET', '/platform/duplicates/queue', None),
    ('GET', '/platform/settings', None),
    ('PUT', '/platform/settings', {}),
    ('GET', '/platform/reconciliation', None),
    ('GET', '/platform/dashboard/admin', None),
    ('GET', '/platform/dashboard/super-admin', None),
    ('GET', '/platform/community/posts', None),
    ('GET', '/platform/reviews/queue', None),
    ('GET', f"/storage/private?key={I['docref_b']}", None),
    ('GET', f"/storage/public?key={I['docref_b']}", None),
    # tenant from body / query / header must be ignored for authenticated callers
    ('GET', '/animals', None, {'x-org-id': ORG_B}),
    ('GET', '/org/documents', None, {'x-org-id': ORG_B}),
    ('GET', '/org/payout-bank-account', None, {'x-org-id': ORG_B}),
]

callers = ['OWNER_A', 'USER_A_ADMIN', 'USER_A_LOW', 'PERSON_Q']
rows = []
out = open(f'{SEC}/evidencia/06_bola_matrix.out', 'w')
for c in cases:
    method, path, body = c[0], c[1], c[2]
    hdr = c[3] if len(c) > 3 else None
    for who in callers:
        st, r = call(method, path, who, body, headers=hdr, raw=True)
        text = r.text
        leak = 200 <= st < 300 and any(m in text for m in MARK)
        verdict = 'LEAK/WRITE' if leak else ('2xx-no-marker' if 200 <= st < 300 else 'denied')
        rows.append([who, method, path, json.dumps(body) if body else '', st, verdict, text[:160].replace('\n', ' ')])
        line = f'{verdict:14s} {st} {who:13s} {method:6s} {path} :: {text[:140]}'
        out.write(line + '\n')
        if verdict != 'denied':
            print(line)
with open(f'{SEC}/evidencia/06_bola_matrix.csv', 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['caller', 'method', 'path', 'body', 'status', 'verdict', 'response_head'])
    w.writerows(rows)
print('total requests', len(rows), 'non-denied', sum(1 for r in rows if r[5] != 'denied'))
