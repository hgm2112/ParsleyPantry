-- Add optional zipcode to stores for Meijer-specific copy prompts etc.
alter table stores
add column if not exists zipcode text;