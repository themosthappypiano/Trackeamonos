-- Run this in the Supabase SQL editor after service access is restored.
-- It reports legacy embedded photos, then removes only oversized ones. Those
-- users can upload a new photo; the app now stores a small 256px WebP instead.

select id, display_name, octet_length(avatar_url) as avatar_bytes
from public.profiles
where avatar_url like 'data:%'
order by avatar_bytes desc;

update public.profiles
set avatar_url = null
where avatar_url like 'data:%'
  and octet_length(avatar_url) > 200000;
