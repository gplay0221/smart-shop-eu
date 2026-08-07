
-- 1. Realistic city centres + per-store offsets and street names
with centers(city, lat, lng, s1, s2, s3, s4) as (values
 ('Amsterdam',52.3676,4.9041,'Nieuwezijds Voorburgwal','Ferdinand Bolstraat','Javastraat','Bos en Lommerweg'),
 ('Antwerp',51.2194,4.4025,'Meir','Nationalestraat','Turnhoutsebaan','Bredabaan'),
 ('Barcelona',41.3851,2.1734,'Carrer de Balmes','Gran Via de les Corts Catalanes','Carrer de Sants','Avinguda Diagonal'),
 ('Berlin',52.5200,13.4050,'Karl-Marx-Allee','Kantstrasse','Schoenhauser Allee','Hermannstrasse'),
 ('Brussels',50.8503,4.3517,'Rue Neuve','Chaussee d''Ixelles','Avenue Louise','Boulevard Anspach'),
 ('Graz',47.0707,15.4395,'Herrengasse','Annenstrasse','Muenzgrabenstrasse','Kaerntner Strasse'),
 ('Hamburg',53.5511,9.9937,'Moenckebergstrasse','Reeperbahn','Eppendorfer Landstrasse','Osterstrasse'),
 ('Lisbon',38.7223,-9.1393,'Avenida da Liberdade','Rua Augusta','Avenida de Roma','Rua da Prata'),
 ('Lyon',45.7640,4.8357,'Rue de la Republique','Cours Gambetta','Avenue Jean Jaures','Rue Garibaldi'),
 ('Madrid',40.4168,-3.7038,'Calle de Alcala','Calle Gran Via','Calle de Bravo Murillo','Paseo de la Castellana'),
 ('Marseille',43.2965,5.3698,'La Canebiere','Rue de Rome','Avenue du Prado','Boulevard Michelet'),
 ('Milan',45.4642,9.1900,'Corso Buenos Aires','Via Torino','Viale Monza','Corso Vercelli'),
 ('Munich',48.1351,11.5820,'Leopoldstrasse','Sendlinger Strasse','Lindwurmstrasse','Rosenheimer Strasse'),
 ('Naples',40.8518,14.2681,'Via Toledo','Corso Umberto I','Via Chiaia','Via Foria'),
 ('Paris',48.8566,2.3522,'Rue de Rivoli','Boulevard Saint-Germain','Avenue de Clichy','Rue de Belleville'),
 ('Porto',41.1579,-8.6291,'Rua de Santa Catarina','Avenida da Boavista','Rua do Bonjardim','Rua da Constituicao'),
 ('Rome',41.9028,12.4964,'Via del Corso','Via Cavour','Viale Marconi','Via Tuscolana'),
 ('Rotterdam',51.9244,4.4777,'Coolsingel','Meent','Beijerlandselaan','Bergweg'),
 ('Utrecht',52.0907,5.1214,'Oudegracht','Amsterdamsestraatweg','Biltstraat','Vleutenseweg'),
 ('Valencia',39.4699,-0.3763,'Calle de Colon','Avenida del Puerto','Gran Via Marques del Turia','Avenida del Cid'),
 ('Vienna',48.2082,16.3738,'Mariahilfer Strasse','Favoritenstrasse','Landstrasser Hauptstrasse','Waehringer Strasse')
),
ranked as (
  select s.id, c.name as city, row_number() over (partition by s.city_id order by s.chain) as rn
  from public.stores s join public.cities c on c.id = s.city_id
)
update public.stores st
set lat = round((ce.lat + (case r.rn when 1 then 0.0090 when 2 then -0.0075 when 3 then 0.0042 else -0.0031 end))::numeric, 5),
    lng = round((ce.lng + (case r.rn when 1 then -0.0110 when 2 then 0.0125 when 3 then 0.0068 else -0.0052 end))::numeric, 5),
    address = (10 + (r.rn * 17)) || ' ' ||
      (case r.rn when 1 then ce.s1 when 2 then ce.s2 when 3 then ce.s3 else ce.s4 end)
      || ', ' || ce.city
from ranked r join centers ce on ce.city = r.city
where st.id = r.id;

-- 2. Brands on existing catalogue items
update public.products set brand = v.brand from (values
 ('Whole Milk','Arla'),('Organic Oat Milk','Oatly'),('Greek Yogurt','Fage'),
 ('Cheddar Cheese','Cathedral City'),('Free-Range Eggs','Happy Egg'),
 ('Chicken Breast','Butcher''s Selection'),('Salmon Fillet','Norwegian Fjord'),
 ('Sourdough Bread','La Boulangerie'),('Croissants','La Boulangerie'),
 ('Bananas','Chiquita'),('Tomatoes','Fresh Market'),('Avocados','Hass'),
 ('Basmati Rice','Tilda'),('Penne Rigate','Barilla'),('Spaghetti No. 5','Barilla'),
 ('Olive Oil','Filippo Berio'),('Ground Coffee','Lavazza'),('Green Tea','Twinings'),
 ('Sparkling Water','San Pellegrino'),('Dark Chocolate 70%','Lindt'),
 ('Sea Salt Chips','Kettle'),('Roasted Almonds','Alesto'),
 ('Toothpaste','Colgate'),('Dish Soap','Fairy'),('Diapers Size 4','Pampers')
) as v(name, brand) where public.products.name = v.name and public.products.brand is null;

-- 3. Branded products people actually search for
insert into public.products (name, brand, category, unit, eco_score, barcode) values
 ('Tomato Ketchup','Heinz','Pantry','570g','C','8715700110301'),
 ('Mayonnaise','Hellmann''s','Pantry','400ml','D','8712100340451'),
 ('Hazelnut Spread','Nutella','Pantry','400g','D','80177173'),
 ('Cola Classic','Coca-Cola','Beverages','1.5L','E','5449000000996'),
 ('Instant Noodles Chicken','Maggi','Pantry','5 pcs','D','7613035122499'),
 ('Corn Flakes','Kellogg''s','Breakfast','500g','C','5053827206952'),
 ('Peanut Butter Smooth','Calve','Pantry','350g','C','8712566333684'),
 ('Chocolate Hazelnut Bar','Milka','Snacks','100g','D','7622210463500'),
 ('Pilsner Beer','Heineken','Beverages','6x330ml','D','8712000027773'),
 ('Laundry Detergent','Ariel','Household','1.1L','C','8001090382733')
on conflict do nothing;

-- 4. Price every new branded product in every store
with newp(name, base) as (values
 ('Tomato Ketchup',249),('Mayonnaise',289),('Hazelnut Spread',349),('Cola Classic',179),
 ('Instant Noodles Chicken',199),('Corn Flakes',329),('Peanut Butter Smooth',269),
 ('Chocolate Hazelnut Bar',149),('Pilsner Beer',579),('Laundry Detergent',699)
),
factors(chain, f) as (values
 ('Lidl',0.88),('Aldi',0.86),('Rewe',1.06),('Edeka',1.08),('Carrefour',1.02),
 ('Auchan',1.00),('Intermarché',1.01),('Mercadona',0.94),('Albert Heijn',1.07),
 ('Conad',1.03),('Esselunga',1.05),('Coop',1.04),('Pingo Doce',0.98),('Continente',0.99),
 ('Spar',1.05),('Billa',1.06),('Jumbo',0.97),('Delhaize',1.08),('Colruyt',0.92),('Penny',0.9)
)
insert into public.prices (product_id, store_id, price_cents, currency)
select p.id, s.id,
       greatest(50, round(n.base * coalesce(f.f, 1.0) * (1 + ((abs(hashtext(p.id::text || s.id::text)) % 11) - 5) / 100.0))::int),
       'EUR'
from public.products p
join newp n on n.name = p.name
cross join public.stores s
left join factors f on f.chain = s.chain
where not exists (select 1 from public.prices pr where pr.product_id = p.id and pr.store_id = s.id);
