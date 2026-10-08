"""Modelo financiero AdoptaFácil — Fase 0 (zona d). TODO son SUPUESTOS salvo
precios unitarios de infraestructura citados en 08_FINOPS. Moneda: COP/mes.
Ejecutar: python3 -I financial_model.py > ../FINANCIAL_MODEL.csv"""
import csv, sys

FX = 4000  # SUPUESTO: COP por USD
FOUNDER = 6_000_000  # SUPUESTO (ANEXO §6)
CASH0 = 30_000_000   # SUPUESTO: caja inicial, POR DEFINIR por el dueño
COMMISSION = 0.04    # D2 (fee de plataforma sobre GMV)
VAT = 0.19           # IVA sobre la comisión: pasivo, NO ingreso (por confirmar contador)
ICA = 0.00966        # SUPUESTO: ICA servicios ~9,66 x mil sobre ingresos (por confirmar contador)
PSP_ON_FEE = 0.0     # SUPUESTO: con split real el PSP cobra su tarifa al collector (org); 0 para AF

S = {
 'CONSERVADOR': dict(active=0.30, gmv=1_000_000, plan_attach=0.05, plan_price=49_000,
    dom_attach=0.02, dom_price=25_000, b2b_per=25, b2b_fee=300_000, infra_proj_per=0, infra_proj_val=0,
    cac=400_000, churn=0.04, support_per_org=15_000, ext_services=1_500_000),
 'BASE': dict(active=0.50, gmv=2_500_000, plan_attach=0.10, plan_price=79_000,
    dom_attach=0.05, dom_price=25_000, b2b_per=15, b2b_fee=600_000, infra_proj_per=50, infra_proj_val=8_000_000,
    cac=250_000, churn=0.025, support_per_org=12_000, ext_services=1_500_000),
 'AGRESIVO': dict(active=0.65, gmv=5_000_000, plan_attach=0.15, plan_price=99_000,
    dom_attach=0.08, dom_price=25_000, b2b_per=10, b2b_fee=1_000_000, infra_proj_per=25, infra_proj_val=12_000_000,
    cac=150_000, churn=0.015, support_per_org=10_000, ext_services=1_500_000),
}

def infra_usd(n):
    """Opción A (VPS Hostinger, D11) interpolada por tramos — ver 08 §2."""
    if n <= 20: return 20
    if n <= 50: return 35
    if n <= 100: return 55
    if n <= 300: return 100
    return 145

def security(n):
    return 1_000_000 if n >= 50 else 0  # SUPUESTO: pentest anual ~12M COP desde 50 orgs

def model(name, p, n, only_fee=False):
    gmv = n * p['active'] * p['gmv']
    platform_fee = gmv * COMMISSION
    vat_collected = platform_fee * VAT
    plans = n * p['plan_attach'] * p['plan_price']
    domains = n * p['dom_attach'] * p['dom_price']
    b2b_count = (n // p['b2b_per']) if p['b2b_per'] else 0
    b2b = b2b_count * p['b2b_fee']
    proj = (n / p['infra_proj_per'] * p['infra_proj_val'] / 12) if p['infra_proj_per'] else 0
    if only_fee:
        plans = domains = b2b = proj = 0; b2b_count = 0
    revenue = platform_fee + plans + domains + b2b + proj
    mrr = platform_fee + plans + domains + b2b  # recurrente (proyectos excluidos)
    # COGS
    cloud = infra_usd(n) * FX
    email_storage_mon = (5 + n * 0.05) * FX  # SUPUESTO: SES + R2/B2 + monitoreo
    domain_cost = n * p['dom_attach'] * 4_000  # SUPUESTO: ~USD 12/año por dominio
    psp = platform_fee * PSP_ON_FEE
    ica = revenue * ICA
    support = n * p['support_per_org']
    proj_cost = proj * 0.5  # SUPUESTO: margen 50 % en proyectos
    cogs = cloud + email_storage_mon + domain_cost + psp + ica + support + proj_cost
    gross_margin = revenue - cogs
    gm_pct = gross_margin / revenue if revenue else 0
    # OPEX
    new_orgs = n * p['churn'] + max(n * 0.05, 1)  # SUPUESTO: reposición churn + 5 % crecimiento
    cac_spend = new_orgs * p['cac']
    opex = FOUNDER + p['ext_services'] + security(n) + cac_spend
    ebitda = gross_margin - opex
    ebitda_no_founder = ebitda + FOUNDER
    burn = -ebitda if ebitda < 0 else 0
    runway = (CASH0 / burn) if burn else float('inf')
    rev_org = revenue / n
    gm_org = gross_margin / n
    ltv = (gm_org / p['churn']) if p['churn'] else 0
    ltv_cac = ltv / p['cac']
    payback = p['cac'] / gm_org if gm_org > 0 else float('inf')
    return dict(escenario=name, organizaciones=n, orgs_activas_recaudando=round(n*p['active']),
        GMV=round(gmv), fee_plataforma_4pct=round(platform_fee), IVA_sobre_fee_no_ingreso=round(vat_collected),
        ingreso_planes=round(plans), ingreso_dominios=round(domains), patrocinios_B2B=b2b_count,
        ingreso_B2B=round(b2b), ingreso_proyectos_infra=round(proj), net_revenue=round(revenue),
        MRR=round(mrr), ARR=round(mrr*12), costo_cloud=round(cloud), costo_email_storage_monitoreo=round(email_storage_mon),
        costo_soporte=round(support), ICA_supuesto=round(ica), COGS=round(cogs), margen_bruto=round(gross_margin),
        margen_bruto_pct=round(gm_pct*100,1), CAC_gasto_mes=round(cac_spend), fundador=FOUNDER,
        servicios_externos=p['ext_services'], seguridad=security(n), EBITDA=round(ebitda),
        EBITDA_sin_fundador=round(ebitda_no_founder), burn=round(burn),
        runway_meses=('inf' if runway == float('inf') else round(runway,1)),
        revenue_por_org=round(rev_org), CAC=p['cac'], churn_mensual=p['churn'], LTV=round(ltv),
        LTV_CAC=round(ltv_cac,2), payback_meses=('inf' if payback == float('inf') else round(payback,1)))

def breakeven(name, p, founder=True, only_fee=False):
    for n in range(1, 5001):
        r = model(name, p, n, only_fee)
        v = r['EBITDA'] if founder else r['EBITDA_sin_fundador']
        if v >= 0: return n
    return '>5000'

rows = []
for name, p in S.items():
    for n in (10, 25, 50, 100, 300):
        r = model(name, p, n)
        r['breakeven_orgs_con_fundador'] = breakeven(name, p, True)
        r['breakeven_orgs_sin_fundador'] = breakeven(name, p, False)
        f = model(name, p, n, True)
        r['solo_comision_net_revenue'] = f['net_revenue']
        r['solo_comision_EBITDA'] = f['EBITDA']
        r['solo_comision_breakeven_con_fundador'] = breakeven(name, p, True, True)
        r['solo_comision_breakeven_sin_fundador'] = breakeven(name, p, False, True)
        rows.append(r)
w = csv.DictWriter(sys.stdout, fieldnames=list(rows[0].keys()))
w.writeheader(); w.writerows(rows)
