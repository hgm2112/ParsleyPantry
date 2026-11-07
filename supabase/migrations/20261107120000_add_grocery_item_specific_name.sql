alter table grocery_items
add column if not exists specific_name text;

comment on column grocery_items.specific_name is 'only for Copy Sale-Only text';