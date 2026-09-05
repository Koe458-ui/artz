-- An album's cover is one image: the first one put in it.
--
-- get_user_albums returned up to four image_urls for a 2x2 mosaic. The card is a single cover now, and the picture that
-- represents an album should be the one that started it — so this returns exactly one, the earliest added.
--
-- Column stays text[] so the result shape does not change; it carries one element instead of four.

CREATE OR REPLACE FUNCTION public.get_user_albums(target uuid)
RETURNS TABLE(id uuid, name text, item_count integer, created_at timestamp with time zone,
              covers text[], is_public boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  select al.id, al.name,
         (select count(*) from album_items ai
            join artworks a on a.id = ai.artwork_id
           where ai.album_id = al.id and a.status = 'approved' and a.kind = 'art')::int,
         al.created_at,
         coalesce((
           select array_agg(c.image_url)
             from (
               select a.image_url
                 from album_items ai
                 join artworks a on a.id = ai.artwork_id
                where ai.album_id = al.id and a.status = 'approved' and a.kind = 'art'
                order by ai.added_at asc
                limit 1
             ) c), '{}'::text[]),
         al.is_public
    from albums al
   where al.user_id = target
     and (al.is_public or al.user_id = auth.uid())
   order by al.created_at desc
$function$;
