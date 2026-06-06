"""Seed idempotente con datos ficticios pero coherentes para la demo.

Ejecutar con:  docker compose run --rm api python -m app.seed
o:  make seed

Genera ~10 vendedores, ~200 clientes, ~150 productos, 24 meses de ventas con
estacionalidad agrícola, cartera con mora en todos los tramos, cotizaciones
abiertas, quiebres de stock, productos sin rotación y lotes por vencer, además
de escenarios de caída de consumo / riesgo de fuga que disparan las alertas del
CRM. Usa una semilla fija de random para que el resultado sea reproducible.
"""
from __future__ import annotations

import calendar
import random
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import delete, func, select

from app.core.config import settings
from app.core.db import SessionLocal, engine
from app.core.security import hash_password
from app.models import (
    AccountReceivable,
    Customer,
    CustomerContact,
    CustomerInteraction,
    Delivery,
    Payment,
    Product,
    Purchase,
    PurchaseItem,
    Quote,
    QuoteItem,
    Role,
    Route,
    Sale,
    SaleItem,
    Salesperson,
    Stock,
    StockLot,
    Supplier,
    SupplierContact,
    User,
    Visit,
    Warehouse,
)
from app.services import analytics

rng = random.Random(42)
TODAY = date.today()

ZONES = ["Pampeana", "NOA", "NEA", "Cuyo", "Patagonia"]
ZONE_WEIGHTS = [0.50, 0.18, 0.15, 0.12, 0.05]

CATEGORIES = ["Fertilizantes", "Fitosanitarios", "Semillas", "Nutrición Animal", "Otros"]
CATEGORY_WEIGHTS = [0.30, 0.28, 0.25, 0.12, 0.05]

# Estacionalidad: campaña fina (siembra trigo May-Jul) y gruesa (soja/maíz Sep-Dic)
MONTH_SEASON = {
    1: 0.7, 2: 0.6, 3: 0.8, 4: 1.0, 5: 1.4, 6: 1.5, 7: 1.3,
    8: 0.9, 9: 1.4, 10: 1.6, 11: 1.5, 12: 1.1,
}

COMPANY_PREFIX = [
    "Agropecuaria", "Establecimiento", "Campos", "La Unión", "Don", "Estancia",
    "Insumos", "Cooperativa", "Granos", "Agro", "Hacienda", "Semillas",
    "El Progreso", "Los Álamos", "San Jorge", "La Esperanza",
]
COMPANY_MID = [
    "del Norte", "del Sur", "y Horizontes", "del Plata", "del Centro", "Pampeana",
    "del Litoral", "Sojera", "Cerealera", "del Campo", "Río Cuarto", "La Pampa",
    "Sancti Spiritu", "Bragado", "Pergamino", "Venado",
]
COMPANY_SUFFIX = ["S.A.", "SRL", "SA", "S.A.S.", "y Cía.", "Agro SRL", "Hnos."]

FIRST_NAMES = ["Juan", "María", "Carlos", "Lucía", "Pedro", "Sofía", "Diego", "Valentina",
               "Martín", "Florencia", "Alberto", "Gabriela", "Ramiro", "Cecilia"]
LAST_NAMES = ["Gómez", "Fernández", "López", "Martínez", "Rodríguez", "Pérez", "García",
              "Sánchez", "Romero", "Sosa", "Díaz", "Acosta", "Benítez", "Molina"]


def _company_name() -> str:
    return f"{rng.choice(COMPANY_PREFIX)} {rng.choice(COMPANY_MID)} {rng.choice(COMPANY_SUFFIX)}"


def _zone() -> str:
    return rng.choices(ZONES, weights=ZONE_WEIGHTS)[0]


# Coordenadas aproximadas por zona (para optimización de rutas)
ZONE_COORDS = {
    "Pampeana": (-34.6, -60.5),
    "NOA": (-24.8, -65.4),
    "NEA": (-27.4, -58.9),
    "Cuyo": (-32.9, -68.8),
    "Patagonia": (-40.8, -65.1),
}


def reset(db) -> None:
    """Borra todos los datos (orden seguro de FK) para que el seed sea idempotente."""
    # Orden seguro de FK: las cotizaciones referencian ventas (quotes.sale_id),
    # así que se borran ANTES que las ventas.
    for model in (
        Payment, AccountReceivable, Delivery, Route, QuoteItem, Quote, SaleItem, Sale,
        PurchaseItem, Purchase, SupplierContact, Supplier, StockLot, Stock, Visit,
        CustomerInteraction, CustomerContact, Customer, Warehouse, Product, User,
        Salesperson, Role,
    ):
        db.execute(delete(model))
    db.commit()


def seed_roles(db) -> dict[str, Role]:
    from app.core.permissions import DEFAULT_PERMISSIONS, normalize

    data = {
        "owner": "Dueño / Gerente",
        "finance": "Administración / Finanzas",
        "sales": "Vendedor",
        "warehouse": "Depósito / Logística",
    }
    roles = {}
    for code, name in data.items():
        r = Role(
            code=code,
            name=name,
            permissions=normalize(DEFAULT_PERMISSIONS.get(code)),
            system=True,
        )
        db.add(r)
        roles[code] = r
    db.flush()
    return roles


def seed_salespeople(db) -> list[Salesperson]:
    names = ["Juan Pérez", "María Gómez", "Carlos López", "Lucía Fernández", "Diego Martínez",
             "Sofía Rodríguez", "Martín Sánchez", "Florencia Romero", "Ramiro Sosa",
             "Gabriela Díaz"]
    sps = []
    for i, name in enumerate(names):
        sp = Salesperson(
            name=name,
            zone=ZONES[i % len(ZONES)],
            monthly_target=rng.choice([8_000_000, 10_000_000, 12_000_000, 15_000_000]),
            active=True,
        )
        db.add(sp)
        sps.append(sp)
    db.flush()
    return sps


def seed_users(db, roles, salespeople) -> None:
    pwd = hash_password(settings.default_user_password)
    users = [
        ("Juan Domínguez", "owner@agro.com", "owner", None),
        ("Patricia Núñez", "finanzas@agro.com", "finance", None),
        ("Depósito Central", "deposito@agro.com", "warehouse", None),
    ]
    for name, email, role_code, _ in users:
        db.add(User(name=name, email=email, hashed_password=pwd, role_id=roles[role_code].id))
    # Un usuario vendedor ligado al primer vendedor
    db.add(
        User(
            name=salespeople[0].name,
            email="vendedor@agro.com",
            hashed_password=pwd,
            role_id=roles["sales"].id,
            salesperson_id=salespeople[0].id,
        )
    )
    db.flush()


def seed_products(db) -> list[Product]:
    fertilizantes = ["Urea Granulada", "Fosfato Diamónico (DAP)", "UAN 32", "Superfosfato Triple",
                     "Nitrato de Amonio", "Sulfato de Amonio", "MAP", "Cloruro de Potasio"]
    fitosanitarios = ["Glifosato 48%", "Atrazina 50%", "2,4-D Amina", "Cipermetrina 25%",
                      "Clorpirifos 48%", "Imidacloprid 35%", "Tebuconazole", "Metsulfurón",
                      "Dicamba", "Lambdacialotrina"]
    semillas = ["Soja DM 53i54", "Maíz Nidera AX 7784", "Trigo Baguette 620", "Girasol Paraíso",
                "Soja NS 6909", "Maíz NK 870", "Sorgo Granífero", "Cebada Andreia"]
    nutricion = ["Sal Mineral Bovinos", "Núcleo Vitamínico", "Balanceado Engorde",
                 "Bloque Proteico", "Suplemento Lechero"]
    otros = ["Inoculante Soja", "Curasemilla", "Adyuvante Aceite", "Bolsa Silo 9x60",
             "Hilo Enfardar"]

    brands_by_cat = {
        "Fertilizantes": ["Nidera", "Profertil", "Bunge", "YPF Agro"],
        "Fitosanitarios": ["Nidera", "Bayer", "Syngenta", "Corteva", "Atanor"],
        "Semillas": ["Nidera", "Don Mario", "Syngenta", "KWS"],
        "Nutrición Animal": ["Nidera", "Biofarma", "Vetanco"],
        "Otros": ["Nidera", "Rizobacter", "Plastar"],
    }
    cat_items = {
        "Fertilizantes": fertilizantes,
        "Fitosanitarios": fitosanitarios,
        "Semillas": semillas,
        "Nutrición Animal": nutricion,
        "Otros": otros,
    }
    units_by_cat = {
        "Fertilizantes": "tn", "Fitosanitarios": "L", "Semillas": "bolsa",
        "Nutrición Animal": "kg", "Otros": "un",
    }
    price_range = {
        "Fertilizantes": (180_000, 650_000),
        "Fitosanitarios": (8_000, 95_000),
        "Semillas": (90_000, 380_000),
        "Nutrición Animal": (3_000, 28_000),
        "Otros": (2_500, 45_000),
    }

    products = []
    sku = 1000
    # Repetimos variantes para llegar a ~150 productos
    for cat in CATEGORIES:
        base_items = cat_items[cat]
        variants = ["", " x25kg", " x50kg", " x200L", " Premium", " Estándar", " Pack",
                    " Bidón", " Big Bag"]
        for item in base_items:
            n_variants = rng.randint(2, 4)
            for v in rng.sample(variants, n_variants):
                sku += 1
                lo, hi = price_range[cat]
                price = round(rng.uniform(lo, hi), 2)
                # margen objetivo variable por categoría
                target = rng.uniform(0.15, 0.35)
                cost = round(price * (1 - target * rng.uniform(0.8, 1.2)), 2)
                cost = min(cost, price * 0.95)
                products.append(
                    Product(
                        sku=f"P-{sku}",
                        name=f"{item}{v}".strip(),
                        category=cat,
                        brand=rng.choice(brands_by_cat[cat]),
                        cost=cost,
                        price=price,
                        target_margin=round(target, 4),
                        unit=units_by_cat[cat],
                        active=True,
                    )
                )
    db.add_all(products)
    db.flush()
    return products


def seed_warehouses(db) -> list[Warehouse]:
    whs = [
        Warehouse(name="Depósito Central", zone="Pampeana"),
        Warehouse(name="Sucursal NOA", zone="NOA"),
        Warehouse(name="Sucursal Litoral", zone="NEA"),
    ]
    db.add_all(whs)
    db.flush()
    return whs


def seed_stock(db, products, warehouses) -> None:
    # ~30% de los productos sin rotación reciente (los marcamos no vendiendo después)
    for p in products:
        wh = rng.choice(warehouses)
        min_q = rng.choice([5, 10, 20, 50])
        # algunos en quiebre (10%) y otros con sobre-stock
        if rng.random() < 0.10:
            qty = rng.uniform(0, min_q)  # quiebre
        else:
            qty = rng.uniform(min_q, min_q * 8)
        db.add(
            Stock(
                product_id=p.id,
                warehouse_id=wh.id,
                quantity=round(qty, 2),
                min_quantity=min_q,
            )
        )
        # Lotes con vencimiento para fitosanitarios / nutrición (los que vencen)
        if p.category in ("Fitosanitarios", "Nutrición Animal", "Semillas"):
            for _ in range(rng.randint(1, 2)):
                # algunos por vencer pronto / vencidos
                offset = rng.choice([-30, 15, 45, 80, 200, 400])
                db.add(
                    StockLot(
                        product_id=p.id,
                        warehouse_id=wh.id,
                        lot_code=f"L{rng.randint(10000, 99999)}",
                        quantity=round(rng.uniform(5, 60), 2),
                        expiry_date=TODAY + timedelta(days=offset),
                    )
                )
    db.flush()


def seed_customers(db, salespeople) -> list[Customer]:
    customers = []
    streets = ["Av. San Martín", "Ruta 8 Km", "Belgrano", "Av. Hipólito Yrigoyen", "Mitre",
               "Av. Circunvalación", "Ruta 9 Km", "Sarmiento"]
    for i in range(200):
        zone = _zone()
        # vendedor de la misma zona si existe, si no cualquiera
        same_zone = [s for s in salespeople if s.zone == zone]
        sp = rng.choice(same_zone) if same_zone and rng.random() < 0.7 else rng.choice(salespeople)
        base_lat, base_lng = ZONE_COORDS[zone]
        city = rng.choice(["Rosario", "Pergamino", "Venado Tuerto", "Río Cuarto",
                           "Salta", "Resistencia", "Mendoza", "Bahía Blanca", "Junín"])
        customers.append(
            Customer(
                name=_company_name(),
                cuit=f"30-{rng.randint(10000000, 99999999)}-{rng.randint(0, 9)}",
                zone=zone,
                city=city,
                address=f"{rng.choice(streets)} {rng.randint(50, 4500)}, {city}",
                phone=f"+54 {rng.randint(220, 388)} {rng.randint(400, 499)}-{rng.randint(1000, 9999)}",
                email=f"contacto@{['agro', 'campo', 'insumos', 'granos'][i % 4]}{rng.randint(10, 99)}.com.ar",
                notes=rng.choice(["", "", "Cliente histórico.", "Paga a 30 días.",
                                  "Trabaja con varias sucursales."]),
                lat=round(base_lat + rng.uniform(-1.5, 1.5), 6),
                lng=round(base_lng + rng.uniform(-1.5, 1.5), 6),
                salesperson_id=sp.id,
                credit_limit=rng.choice([2_000_000, 5_000_000, 10_000_000, 20_000_000]),
                credit_score=600,
                status="active",
                created_at=datetime.now(timezone.utc)
                - timedelta(days=rng.randint(20, 1000)),
            )
        )
    db.add_all(customers)
    db.flush()

    # Contactos por cliente (1 a 3)
    first = ["Ana Lía", "Ricardo", "Marta", "Jorge", "Verónica", "Sergio", "Paula", "Hernán"]
    last = ["Gómez", "Fernández", "López", "Martínez", "Sosa", "Díaz", "Romero"]
    areas = ["Administración", "Compras", "Gerencia", "Tesorería", "Producción"]
    for c in customers:
        for _ in range(rng.randint(1, 3)):
            db.add(
                CustomerContact(
                    customer_id=c.id,
                    name=f"{rng.choice(first)} {rng.choice(last)}",
                    role=rng.choice(areas),
                    phone=f"+54 {rng.randint(220, 388)} {rng.randint(400, 499)}-{rng.randint(1000, 9999)}",
                    mobile=f"+54 9 {rng.randint(220, 388)} {rng.randint(400, 499)}-{rng.randint(1000, 9999)}",
                    email=f"{rng.choice(['admin', 'compras', 'pagos', 'info'])}@cliente{c.id}.com.ar",
                    notes="",
                )
            )
    db.flush()
    return customers


def _month_iter(months_back: int):
    """Genera (year, month) desde months_back meses atrás hasta el mes actual."""
    y, m = TODAY.year, TODAY.month
    seq = []
    for _ in range(months_back):
        seq.append((y, m))
        m -= 1
        if m < 1:
            m = 12
            y -= 1
    return list(reversed(seq))


def seed_sales(db, customers, products, salespeople):
    """24 meses de ventas con estacionalidad. Marca clientes en caída de consumo."""
    # Designamos ~18 clientes "en caída": compran fuerte hasta hace ~4 meses y luego casi nada
    declining = set(rng.sample([c.id for c in customers], 18))
    # ~30% de productos quedan sin venta reciente (sin rotación)
    no_rotation = set(rng.sample([p.id for p in products], int(len(products) * 0.30)))

    sale_counter = 0
    months = _month_iter(24)
    for (y, m) in months:
        season = MONTH_SEASON[m]
        n_sales = int(rng.uniform(120, 180) * season)
        days_in_month = calendar.monthrange(y, m)[1]
        # El mes en curso es parcial: limitamos los días y prorrateamos el volumen
        if (y, m) == (TODAY.year, TODAY.month):
            max_day = max(1, TODAY.day)
            n_sales = int(n_sales * TODAY.day / days_in_month)
        else:
            max_day = days_in_month
        recent = (y == TODAY.year and m >= TODAY.month - 3) or (
            y == TODAY.year - 1 and m >= 12 and TODAY.month <= 3
        )
        is_last_90 = (TODAY - date(y, m, 15)).days <= 95

        for _ in range(n_sales):
            cust = rng.choice(customers)
            # los declining casi no compran en los últimos ~3 meses
            if cust.id in declining and is_last_90 and rng.random() < 0.85:
                continue
            sp_id = cust.salesperson_id
            day = rng.randint(1, max_day)
            sale_date = date(y, m, day)
            sale_counter += 1
            sale = Sale(
                code=f"VTA-{y}-{sale_counter:05d}",
                customer_id=cust.id,
                salesperson_id=sp_id,
                date=sale_date,
                status="confirmed",
                doc_type=rng.choices(
                    ["Factura A", "Factura B", "Factura C", "Remito", "Presupuesto"],
                    weights=[0.35, 0.4, 0.1, 0.1, 0.05],
                )[0],
            )
            db.add(sale)
            db.flush()

            n_items = rng.randint(1, 4)
            subtotal = total = total_cost = 0.0
            chosen = rng.sample(products, n_items)
            for prod in chosen:
                if prod.id in no_rotation and is_last_90:
                    # estos productos no se venden en los últimos meses
                    continue
                qty = round(rng.uniform(1, 30), 2)
                unit_price = float(prod.price)
                discount = rng.choice([0, 0, 0, 0.05, 0.08, 0.12, 0.20])  # algunos excesivos
                line_total = unit_price * qty * (1 - discount)
                line_cost = float(prod.cost) * qty
                db.add(
                    SaleItem(
                        sale_id=sale.id,
                        product_id=prod.id,
                        quantity=qty,
                        unit_price=unit_price,
                        unit_cost=prod.cost,
                        discount=discount,
                        line_total=round(line_total, 2),
                        line_margin=round(line_total - line_cost, 2),
                    )
                )
                subtotal += unit_price * qty
                total += line_total
                total_cost += line_cost
            if total == 0:
                db.delete(sale)
                continue
            sale.subtotal = round(subtotal, 2)
            sale.discount_amount = round(subtotal - total, 2)
            sale.total = round(total, 2)
            sale.total_cost = round(total_cost, 2)
            sale.margin_amount = round(total - total_cost, 2)
        db.flush()
    return declining


def seed_receivables(db, customers):
    """Cartera por cobrar con mora en todos los tramos.

    Cubre ~13 meses de ventas a crédito para que la 'deuda generada' por mes tenga
    historia. La probabilidad de cobro crece con la antigüedad: las deudas viejas
    están casi todas saldadas (mora concentrada en lo reciente, como en la realidad).
    """
    sales = db.scalars(
        select(Sale).where(Sale.date >= TODAY - timedelta(days=400)).order_by(Sale.date)
    ).all()
    for s in sales:
        if rng.random() < 0.45:  # 45% a crédito
            continue
        terms = rng.choice([30, 45, 60])
        due = s.date + timedelta(days=terms)
        amount = float(s.total)
        overdue_days = (TODAY - due).days
        r = rng.random()
        if overdue_days < 0:
            # aún no vence: la mayoría sigue impaga (cartera corriente)
            paid = amount if r < 0.2 else 0.0
        else:
            # cuanto más vieja la deuda, más probable que esté cobrada
            if overdue_days > 120:
                p_paid, p_partial = 0.93, 0.05
            elif overdue_days > 60:
                p_paid, p_partial = 0.75, 0.18
            else:
                p_paid, p_partial = 0.55, 0.27
            if r < p_paid:
                paid = amount
            elif r < p_paid + p_partial:
                paid = round(amount * rng.uniform(0.3, 0.75), 2)
            else:
                paid = 0.0
        status = "paid" if paid >= amount else ("partial" if paid > 0 else "open")
        ar = AccountReceivable(
            customer_id=s.customer_id,
            sale_id=s.id,
            amount=round(amount, 2),
            paid_amount=round(paid, 2),
            issue_date=s.date,
            due_date=due,
            status=status,
        )
        db.add(ar)
        db.flush()
        if paid > 0:
            db.add(
                Payment(
                    receivable_id=ar.id,
                    customer_id=s.customer_id,
                    amount=round(paid, 2),
                    date=min(TODAY, due + timedelta(days=rng.randint(-5, 20))),
                    method=rng.choice(["transferencia", "cheque", "efectivo"]),
                )
            )
    db.flush()


def seed_quotes(db, customers, products, salespeople):
    """Cotizaciones abiertas en distintos estados + cerradas (para tasa de conversión)."""
    statuses = (
        ["draft"] * 8 + ["sent"] * 14 + ["negotiating"] * 10 + ["won"] * 22 + ["lost"] * 12
    )
    for i, st in enumerate(statuses, 1):
        cust = rng.choice(customers)
        created = TODAY - timedelta(days=rng.randint(1, 90))
        q = Quote(
            code=f"COT-{TODAY.year}-{i:04d}",
            customer_id=cust.id,
            salesperson_id=cust.salesperson_id,
            status=st,
            created_at=datetime.combine(created, datetime.min.time(), tzinfo=timezone.utc),
            valid_until=created + timedelta(days=rng.choice([15, 30, 45])),
            notes="",
        )
        db.add(q)
        db.flush()
        total = 0.0
        for prod in rng.sample(products, rng.randint(1, 4)):
            qty = round(rng.uniform(1, 20), 2)
            disc = rng.choice([0, 0, 0.05, 0.10])
            db.add(
                QuoteItem(
                    quote_id=q.id,
                    product_id=prod.id,
                    quantity=qty,
                    unit_price=prod.price,
                    discount=disc,
                )
            )
            total += float(prod.price) * qty * (1 - disc)
        q.total = round(total, 2)
    db.flush()


def seed_visits_interactions(db, customers, declining):
    interaction_types = ["llamada", "visita", "email", "whatsapp", "reclamo"]
    for c in customers:
        # interacciones históricas
        for _ in range(rng.randint(0, 5)):
            days = rng.randint(1, 300)
            db.add(
                CustomerInteraction(
                    customer_id=c.id,
                    salesperson_id=c.salesperson_id,
                    type=rng.choice(interaction_types),
                    channel=rng.choice(["teléfono", "presencial", "mail", "whatsapp"]),
                    notes=rng.choice([
                        "Consultó precios de fertilizantes.",
                        "Pidió cotización de semillas para campaña.",
                        "Reclamo por demora en entrega.",
                        "Interesado en plan de financiación.",
                        "Sin novedades, seguimiento de rutina.",
                    ]),
                    date=datetime.now(timezone.utc) - timedelta(days=days),
                )
            )
        # visitas: los declining hace mucho que no reciben visita
        last_visit_days = rng.randint(80, 200) if c.id in declining else rng.randint(5, 90)
        db.add(
            Visit(
                customer_id=c.id,
                salesperson_id=c.salesperson_id,
                scheduled_date=TODAY - timedelta(days=last_visit_days),
                done_date=TODAY - timedelta(days=last_visit_days),
                status="done",
            )
        )
        # alguna visita futura pendiente
        if rng.random() < 0.4:
            db.add(
                Visit(
                    customer_id=c.id,
                    salesperson_id=c.salesperson_id,
                    scheduled_date=TODAY + timedelta(days=rng.randint(1, 20)),
                    status="pending",
                )
            )
    db.flush()


def seed_suppliers_purchases(db, products):
    sup_data = [
        ("Nidera S.A.", "Nidera", "Pampeana"),
        ("Profertil S.A.", "Profertil", "Pampeana"),
        ("Bayer CropScience S.A.", "Bayer", "Pampeana"),
        ("Syngenta Agro S.A.", "Syngenta", "Pampeana"),
        ("Rizobacter Argentina S.A.", "Rizobacter", "Pampeana"),
    ]
    conditions = ["Responsable Inscripto", "Monotributo", "Exento"]
    suppliers = []
    for name, trade, zone in sup_data:
        suppliers.append(
            Supplier(
                name=name,
                trade_name=trade,
                cuit=f"30-{rng.randint(50000000, 71000000)}-{rng.randint(0, 9)}",
                zone=zone,
                address=f"Av. Industrial {rng.randint(100, 3000)}, Buenos Aires",
                phone=f"+54 11 {rng.randint(4000, 4999)}-{rng.randint(1000, 9999)}",
                email=f"ventas@{trade.lower()}.com",
                tax_condition=rng.choice(conditions),
                notes="",
                active=True,
            )
        )
    db.add_all(suppliers)
    db.flush()
    # Contactos por proveedor
    for s in suppliers:
        for _ in range(rng.randint(1, 2)):
            db.add(
                SupplierContact(
                    supplier_id=s.id,
                    name=rng.choice(["Laura Méndez", "Gustavo Ríos", "Cecilia Paz", "Andrés Coria"]),
                    role=rng.choice(["Ejecutivo de cuenta", "Logística", "Administración"]),
                    phone=f"+54 11 {rng.randint(4000, 4999)}-{rng.randint(1000, 9999)}",
                    mobile=f"+54 9 11 {rng.randint(4000, 4999)}-{rng.randint(1000, 9999)}",
                    email=f"contacto@{s.trade_name.lower()}.com",
                    notes="",
                )
            )
    db.flush()
    for i in range(40):
        sup = rng.choice(suppliers)
        d = TODAY - timedelta(days=rng.randint(1, 365))
        p = Purchase(
            code=f"OC-{d.year}-{i + 1:04d}",
            supplier_id=sup.id,
            date=d,
            status=rng.choice(["received", "received", "pending"]),
        )
        db.add(p)
        db.flush()
        total = 0.0
        for prod in rng.sample(products, rng.randint(2, 6)):
            qty = round(rng.uniform(10, 200), 2)
            cost = float(prod.cost)
            db.add(PurchaseItem(purchase_id=p.id, product_id=prod.id, quantity=qty, unit_cost=cost))
            total += qty * cost
        p.total = round(total, 2)
    db.flush()


def seed_logistics(db, customers):
    routes = []
    for zone in ZONES:
        r = Route(
            name=f"Ruta {zone} - Semana actual",
            zone=zone,
            date=TODAY + timedelta(days=rng.randint(0, 5)),
            driver=rng.choice(["Sergio Vega", "Hugo Páez", "Marcelo Ríos"]),
            status=rng.choice(["planned", "in_progress"]),
        )
        db.add(r)
        routes.append(r)
    db.flush()

    recent_sales = db.scalars(
        select(Sale).where(Sale.date >= TODAY - timedelta(days=30)).limit(60)
    ).all()
    statuses = ["pending", "picking", "dispatched", "in_transit", "delivered"]
    order_by_route: dict[int, int] = {}
    for s in recent_sales:
        cust = db.get(Customer, s.customer_id)
        route = next((r for r in routes if r.zone == cust.zone), None)
        rid = route.id if route else None
        order_by_route[rid] = order_by_route.get(rid, 0) + 1
        db.add(
            Delivery(
                sale_id=s.id,
                customer_id=cust.id,
                route_id=rid,
                address=f"{cust.city} - {cust.zone}",
                zone=cust.zone,
                scheduled_date=s.date + timedelta(days=rng.randint(1, 7)),
                status=rng.choice(statuses),
                is_urgent=rng.random() < 0.15,
                stop_order=order_by_route[rid],
            )
        )
    db.flush()


def set_targets(db, salespeople):
    """Calibra el objetivo mensual de cada vendedor contra su venta real.

    Toma el promedio mensual de los últimos 6 meses completos y le aplica un
    multiplicador por vendedor para generar un abanico realista de cumplimiento
    (algunos óptimos ≥90%, otros en riesgo 70-89%, otros críticos <70%).
    """
    # multiplicadores objetivo/venta → cumplimiento ≈ 1/mult
    mults = [0.82, 1.18, 0.95, 1.45, 1.05, 0.78, 1.28, 1.10, 0.90, 1.55]
    first_of_month = TODAY.replace(day=1)
    window_start = (first_of_month - timedelta(days=183)).replace(day=1)
    for i, sp in enumerate(salespeople):
        total = db.scalar(
            select(func.coalesce(func.sum(Sale.total), 0))
            .where(
                Sale.salesperson_id == sp.id,
                Sale.status == "confirmed",
                Sale.date >= window_start,
                Sale.date < first_of_month,
            )
        )
        avg_monthly = float(total or 0) / 6
        mult = mults[i % len(mults)]
        # objetivo mínimo razonable por si el vendedor casi no vendió
        sp.monthly_target = round(max(avg_monthly * mult, 5_000_000), -5)
    db.flush()


def finalize(db, customers):
    """Calcula RFM, ABC y scoring, y marca status at_risk según recencia."""
    analytics.compute_rfm(db)
    analytics.compute_abc(db)
    for c in db.scalars(select(Customer)).all():
        c.credit_score = analytics.credit_score(db, c)
        if c.rfm_recency == 1 and c.rfm_frequency and c.rfm_frequency >= 2:
            c.status = "at_risk"
        elif c.rfm_segment == "Inactivo":
            c.status = "lost"
    db.flush()


def run() -> None:
    # Aseguramos que las tablas existan (por si se corre sin migraciones previas)
    from app.core.db import Base

    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        print("→ Limpiando datos previos…")
        reset(db)
        print("→ Roles y usuarios…")
        roles = seed_roles(db)
        salespeople = seed_salespeople(db)
        seed_users(db, roles, salespeople)
        print("→ Productos, depósitos y stock…")
        products = seed_products(db)
        warehouses = seed_warehouses(db)
        seed_stock(db, products, warehouses)
        print("→ Clientes…")
        customers = seed_customers(db, salespeople)
        print("→ 24 meses de ventas (con estacionalidad)…")
        declining = seed_sales(db, customers, products, salespeople)
        print("→ Cuentas por cobrar y pagos…")
        seed_receivables(db, customers)
        print("→ Cotizaciones (pipeline)…")
        seed_quotes(db, customers, products, salespeople)
        print("→ Visitas e interacciones…")
        seed_visits_interactions(db, customers, declining)
        print("→ Proveedores y compras…")
        seed_suppliers_purchases(db, products)
        print("→ Logística y entregas…")
        seed_logistics(db, customers)
        print("→ Calibrando objetivos de vendedores…")
        set_targets(db, salespeople)
        print("→ Calculando RFM / ABC / scoring…")
        finalize(db, customers)
        db.commit()

        n_sales = db.scalar(select(func.count(Sale.id)))
        print("\n✅ Seed completo.")
        print(f"   Clientes: {len(customers)} | Productos: {len(products)} | Ventas: {n_sales}")
        print("\n   Usuarios de prueba (contraseña: "
              f"{settings.default_user_password}):")
        print("   • owner@agro.com      (Dueño/Gerente)")
        print("   • finanzas@agro.com   (Administración/Finanzas)")
        print("   • vendedor@agro.com   (Vendedor)")
        print("   • deposito@agro.com   (Depósito/Logística)")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()
