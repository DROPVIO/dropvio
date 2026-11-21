-- 050_medias_site.sql
-- Images générées avec un site (case « Générer des images avec OpenAI » du Site Builder) :
-- rattachées au site dans la médiathèque. Requiert 046_mediatheque.sql. Supprimer le site garde
-- les images dans la médiathèque, sans lien.
alter table medias
  add column if not exists site_id uuid references sites_generes(id) on delete set null;

create index if not exists medias_site_idx on medias (site_id)
  where site_id is not null;
