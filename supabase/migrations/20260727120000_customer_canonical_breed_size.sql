-- Derive authoritative dog size from the application's trusted breed mapping.
--
-- Customer-provided p_size remains only a reported value. The authoritative
-- dogs.size value comes from the server-owned mapping below. Crosses are
-- accepted only in the unambiguous "Parent A x Parent B" form and only for the
-- approved small/small, medium/medium and small/medium combinations.

create or replace function public.canonical_single_breed_size(p_breed text)
returns text
language plpgsql
immutable
parallel safe
set search_path = public, pg_temp
as $$
begin
  case lower(btrim(coalesce(p_breed, '')))
    when 'king charles cavalier' then return 'small';
    when 'cavalier king charles spaniel' then return 'small';
    when 'maltese' then return 'small';
    when 'bichon frise' then return 'small';
    when 'shih tzu' then return 'small';
    when 'yorkshire terrier' then return 'small';
    when 'yorkie' then return 'small';
    when 'pomeranian' then return 'small';
    when 'chihuahua' then return 'small';
    when 'mini dachshund' then return 'small';
    when 'miniature dachshund' then return 'small';
    when 'toy poodle' then return 'small';
    when 'lhasa apso' then return 'small';
    when 'french bulldog' then return 'small';
    when 'frenchie' then return 'small';
    when 'pug' then return 'small';
    when 'boston terrier' then return 'small';
    when 'havanese' then return 'small';
    when 'papillon' then return 'small';
    when 'italian greyhound' then return 'small';
    when 'japanese chin' then return 'small';
    when 'brussels griffon' then return 'small';
    when 'affenpinscher' then return 'small';
    when 'miniature pinscher' then return 'small';
    when 'min pin' then return 'small';
    when 'chinese crested' then return 'small';
    when 'pekingese' then return 'small';
    when 'scottish terrier' then return 'small';
    when 'scottie' then return 'small';
    when 'west highland terrier' then return 'small';
    when 'west highland white terrier' then return 'small';
    when 'westie' then return 'small';
    when 'jack russell' then return 'small';
    when 'jack russell terrier' then return 'small';
    when 'cairn terrier' then return 'small';
    when 'norfolk terrier' then return 'small';
    when 'norwich terrier' then return 'small';
    when 'toy fox terrier' then return 'small';
    when 'silky terrier' then return 'small';
    when 'dandie dinmont terrier' then return 'small';
    when 'english toy terrier' then return 'small';
    when 'löwchen' then return 'small';
    when 'lowchen' then return 'small';
    when 'bolognese' then return 'small';
    when 'cockapoo' then return 'medium';
    when 'cavapoo' then return 'medium';
    when 'poodle (miniature)' then return 'medium';
    when 'miniature poodle' then return 'medium';
    when 'cocker spaniel' then return 'medium';
    when 'springer spaniel' then return 'medium';
    when 'english springer spaniel' then return 'medium';
    when 'welsh springer spaniel' then return 'medium';
    when 'beagle' then return 'medium';
    when 'border terrier' then return 'medium';
    when 'yorkipoo' then return 'medium';
    when 'staffordshire bull terrier' then return 'medium';
    when 'staffie' then return 'medium';
    when 'staffy' then return 'medium';
    when 'whippet' then return 'medium';
    when 'bedlington terrier' then return 'medium';
    when 'kerry blue terrier' then return 'medium';
    when 'soft coated wheaten terrier' then return 'medium';
    when 'australian terrier' then return 'medium';
    when 'lakeland terrier' then return 'medium';
    when 'welsh terrier' then return 'medium';
    when 'tibetan terrier' then return 'medium';
    when 'schnauzer (miniature)' then return 'medium';
    when 'miniature schnauzer' then return 'medium';
    when 'schnauzer (standard)' then return 'medium';
    when 'standard schnauzer' then return 'medium';
    when 'schnauzer' then return 'medium';
    when 'bulldog' then return 'medium';
    when 'english bulldog' then return 'medium';
    when 'keeshond' then return 'medium';
    when 'shiba inu' then return 'medium';
    when 'basenji' then return 'medium';
    when 'basset hound' then return 'medium';
    when 'portuguese water dog' then return 'medium';
    when 'spanish water dog' then return 'medium';
    when 'lagotto romagnolo' then return 'medium';
    when 'australian shepherd' then return 'medium';
    when 'aussie' then return 'medium';
    when 'border collie' then return 'medium';
    when 'collie (rough)' then return 'medium';
    when 'rough collie' then return 'medium';
    when 'collie (smooth)' then return 'medium';
    when 'smooth collie' then return 'medium';
    when 'collie' then return 'medium';
    when 'shetland sheepdog' then return 'medium';
    when 'sheltie' then return 'medium';
    when 'finnish spitz' then return 'medium';
    when 'norwegian elkhound' then return 'medium';
    when 'eurasier' then return 'medium';
    when 'bull terrier' then return 'medium';
    when 'standard dachshund' then return 'medium';
    when 'dachshund' then return 'medium';
    when 'field spaniel' then return 'medium';
    when 'sussex spaniel' then return 'medium';
    when 'sprocker' then return 'medium';
    when 'spoodle' then return 'medium';
    when 'maltipoo' then return 'medium';
    when 'cavachon' then return 'medium';
    when 'poochon' then return 'medium';
    when 'jackapoo' then return 'medium';
    when 'poodle' then return 'medium';
    when 'labrador' then return 'large';
    when 'labrador retriever' then return 'large';
    when 'lab' then return 'large';
    when 'poodle (standard)' then return 'large';
    when 'standard poodle' then return 'large';
    when 'golden retriever' then return 'large';
    when 'german shepherd' then return 'large';
    when 'gsd' then return 'large';
    when 'husky' then return 'large';
    when 'siberian husky' then return 'large';
    when 'bernese mountain dog' then return 'large';
    when 'rottweiler' then return 'large';
    when 'doberman' then return 'large';
    when 'dobermann' then return 'large';
    when 'labradoodle' then return 'large';
    when 'goldendoodle' then return 'large';
    when 'chow chow' then return 'large';
    when 'alaskan malamute' then return 'large';
    when 'akita' then return 'large';
    when 'great dane' then return 'large';
    when 'saint bernard' then return 'large';
    when 'st bernard' then return 'large';
    when 'newfoundland' then return 'large';
    when 'newfie' then return 'large';
    when 'mastiff' then return 'large';
    when 'english mastiff' then return 'large';
    when 'cane corso' then return 'large';
    when 'great pyrenees' then return 'large';
    when 'leonberger' then return 'large';
    when 'irish wolfhound' then return 'large';
    when 'greyhound' then return 'large';
    when 'afghan hound' then return 'large';
    when 'saluki' then return 'large';
    when 'weimaraner' then return 'large';
    when 'vizsla' then return 'large';
    when 'german shorthaired pointer' then return 'large';
    when 'german wirehaired pointer' then return 'large';
    when 'rhodesian ridgeback' then return 'large';
    when 'belgian malinois' then return 'large';
    when 'belgian shepherd (tervuren)' then return 'large';
    when 'belgian shepherd (groenendael)' then return 'large';
    when 'belgian shepherd' then return 'large';
    when 'boxer' then return 'large';
    when 'old english sheepdog' then return 'large';
    when 'briard' then return 'large';
    when 'komondor' then return 'large';
    when 'kuvasz' then return 'large';
    when 'anatolian shepherd' then return 'large';
    when 'tibetan mastiff' then return 'large';
    when 'dogue de bordeaux' then return 'large';
    when 'black russian terrier' then return 'large';
    when 'airedale terrier' then return 'large';
    when 'airedale' then return 'large';
    when 'giant schnauzer' then return 'large';
    when 'flat-coated retriever' then return 'large';
    when 'curly-coated retriever' then return 'large';
    when 'chesapeake bay retriever' then return 'large';
    when 'english setter' then return 'large';
    when 'irish setter' then return 'large';
    when 'gordon setter' then return 'large';
    when 'bloodhound' then return 'large';
    when 'borzoi' then return 'large';
    when 'bernedoodle' then return 'large';
    when 'sheepadoodle' then return 'large';
    when 'irish doodle' then return 'large';
    else return null;
  end case;
end;
$$;

revoke all on function public.canonical_single_breed_size(text) from public;
revoke all on function public.canonical_single_breed_size(text) from anon;
revoke all on function public.canonical_single_breed_size(text) from authenticated;

create or replace function public.derive_canonical_dog_size(p_breed text)
returns text
language plpgsql
immutable
parallel safe
set search_path = public, pg_temp
as $$
declare
  v_direct_size text := public.canonical_single_breed_size(p_breed);
  v_parents text[];
  v_first_size text;
  v_second_size text;
begin
  if v_direct_size is not null then
    return v_direct_size;
  end if;

  v_parents := regexp_split_to_array(
    btrim(coalesce(p_breed, '')),
    '[[:space:]]+[x×][[:space:]]+',
    'i'
  );
  if cardinality(v_parents) <> 2 then
    return null;
  end if;

  v_first_size := public.canonical_single_breed_size(v_parents[1]);
  v_second_size := public.canonical_single_breed_size(v_parents[2]);
  if v_first_size not in ('small', 'medium')
     or v_second_size not in ('small', 'medium') then
    return null;
  end if;

  if v_first_size = 'medium' or v_second_size = 'medium' then
    return 'medium';
  end if;
  return 'small';
end;
$$;

revoke all on function public.derive_canonical_dog_size(text) from public;
revoke all on function public.derive_canonical_dog_size(text) from anon;
revoke all on function public.derive_canonical_dog_size(text) from authenticated;

create or replace function public.create_customer_dog(
  p_name text,
  p_breed text default null,
  p_size text default null,
  p_human_id uuid default null
)
returns table (
  id uuid,
  name text,
  breed text,
  size text,
  reported_size text,
  human_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_my_id uuid;
  v_dog public.dogs%rowtype;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_breed text := nullif(trim(coalesce(p_breed, '')), '');
  v_size text := nullif(trim(lower(coalesce(p_size, ''))), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select h.id into v_my_id
  from public.humans h
  where h.customer_user_id = v_uid
  limit 1
  for update;

  if v_my_id is null then
    raise exception 'no_linked_human' using errcode = '28000';
  end if;

  if p_human_id is null or p_human_id <> v_my_id then
    raise exception 'not_your_human' using errcode = '42501';
  end if;

  if v_name is null then
    raise exception 'name_required' using errcode = '22023';
  end if;

  if v_size is not null and v_size not in ('small', 'medium', 'large') then
    raise exception 'invalid_size' using errcode = '22023';
  end if;

  insert into public.dogs (name, breed, reported_size, human_id, size)
  values (
    v_name,
    v_breed,
    v_size,
    v_my_id,
    public.derive_canonical_dog_size(v_breed)
  )
  returning * into v_dog;

  return query
    select v_dog.id, v_dog.name, v_dog.breed, v_dog.size,
           v_dog.reported_size, v_dog.human_id;
end;
$$;

revoke all on function public.create_customer_dog(text, text, text, uuid) from public;
revoke all on function public.create_customer_dog(text, text, text, uuid) from anon;
revoke all on function public.create_customer_dog(text, text, text, uuid) from authenticated;
grant execute on function public.create_customer_dog(text, text, text, uuid) to authenticated;

create or replace function public.update_customer_dog(
  p_dog_id uuid,
  p_name text,
  p_breed text default null,
  p_size text default null,
  p_dob text default null
)
returns table (
  id uuid,
  name text,
  breed text,
  size text,
  reported_size text,
  dob text,
  human_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_my_id uuid;
  v_dog public.dogs%rowtype;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_breed text := nullif(trim(coalesce(p_breed, '')), '');
  v_size text := nullif(trim(lower(coalesce(p_size, ''))), '');
  v_dob text := nullif(trim(coalesce(p_dob, '')), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select h.id into v_my_id
  from public.humans h
  where h.customer_user_id = v_uid
  limit 1
  for update;

  if v_my_id is null then
    raise exception 'no_linked_human' using errcode = '28000';
  end if;

  select * into v_dog
  from public.dogs d
  where d.id = p_dog_id and d.human_id = v_my_id
  limit 1
  for update;

  if v_dog.id is null then
    raise exception 'dog_not_found' using errcode = '42704';
  end if;

  if v_name is null then
    raise exception 'name_required' using errcode = '22023';
  end if;

  if v_size is not null and v_size not in ('small', 'medium', 'large') then
    raise exception 'invalid_size' using errcode = '22023';
  end if;

  update public.dogs d
  set name = v_name,
      breed = v_breed,
      size = case
        when lower(btrim(coalesce(d.breed, '')))
             = lower(btrim(coalesce(v_breed, '')))
          then d.size
        else public.derive_canonical_dog_size(v_breed)
      end,
      reported_size = v_size,
      dob = v_dob
  where d.id = p_dog_id
    and d.human_id = v_my_id
  returning d.* into v_dog;

  if not found then
    raise exception 'dog_not_found' using errcode = '42704';
  end if;

  return query
    select v_dog.id, v_dog.name, v_dog.breed, v_dog.size,
           v_dog.reported_size, v_dog.dob, v_dog.human_id;
end;
$$;

revoke all on function public.update_customer_dog(uuid, text, text, text, text) from public;
revoke all on function public.update_customer_dog(uuid, text, text, text, text) from anon;
revoke all on function public.update_customer_dog(uuid, text, text, text, text) from authenticated;
grant execute on function public.update_customer_dog(uuid, text, text, text, text) to authenticated;

create or replace function public.submit_customer_signup(p_owner jsonb, p_dogs jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_human public.humans%rowtype;
  v_name text;
  v_surname text;
  v_address text;
  v_elem jsonb;
  v_breed text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_human
  from public.humans h
  where h.customer_user_id = v_uid
  limit 1
  for update;

  if v_human.id is null then
    raise exception 'No account is linked to set up' using errcode = '28000';
  end if;

  if v_human.source is distinct from 'self_signup'
     or v_human.approved_at is not null
     or v_human.signup_submitted_at is not null then
    raise exception 'signup_not_pending' using errcode = 'P0001';
  end if;

  v_name := trim(coalesce(p_owner->>'name', ''));
  v_surname := trim(coalesce(p_owner->>'surname', ''));
  v_address := trim(coalesce(p_owner->>'address', ''));
  if v_name = '' or v_surname = '' or v_address = '' then
    raise exception 'Please give your name and address.' using errcode = 'P0001';
  end if;

  if p_dogs is null
     or jsonb_typeof(p_dogs) <> 'array'
     or jsonb_array_length(p_dogs) < 1 then
    raise exception 'Please tell us about at least one dog.' using errcode = 'P0001';
  end if;

  begin
    update public.humans h
    set name = v_name,
        surname = v_surname,
        address = v_address,
        postcode = nullif(trim(coalesce(p_owner->>'postcode', '')), ''),
        email = nullif(trim(coalesce(p_owner->>'email', '')), ''),
        sms = coalesce((p_owner->>'sms')::boolean, false),
        whatsapp = coalesce((p_owner->>'whatsapp')::boolean, false),
        heard_about_us = nullif(trim(coalesce(p_owner->>'heard_about_us', '')), ''),
        policies_accepted_at = now(),
        policies_version = nullif(trim(coalesce(p_owner->>'policies_version', '')), ''),
        signup_submitted_at = now()
    where h.id = v_human.id;
  exception when unique_violation then
    raise exception 'We may already have you on file under that name — please contact the salon.'
      using errcode = 'P0001';
  end;

  for v_elem in select * from jsonb_array_elements(p_dogs) loop
    v_breed := trim(coalesce(v_elem->>'breed', ''));
    if trim(coalesce(v_elem->>'name', '')) = '' or v_breed = '' then
      raise exception 'Each dog needs a name and breed.' using errcode = 'P0001';
    end if;

    insert into public.dogs (
      human_id, name, breed, reported_size, size, sex, dob,
      microchip, neutered, vet, colour, groom_notes, alerts
    ) values (
      v_human.id,
      trim(v_elem->>'name'),
      v_breed,
      nullif(trim(lower(coalesce(v_elem->>'size', ''))), ''),
      public.derive_canonical_dog_size(v_breed),
      nullif(trim(lower(coalesce(v_elem->>'sex', ''))), ''),
      nullif(trim(coalesce(v_elem->>'dob', '')), ''),
      nullif(trim(coalesce(v_elem->>'microchip', '')), ''),
      (v_elem->>'neutered')::boolean,
      nullif(trim(coalesce(v_elem->>'vet', '')), ''),
      nullif(trim(coalesce(v_elem->>'colour', '')), ''),
      coalesce(trim(v_elem->>'groom_notes'), ''),
      coalesce(
        array(
          select jsonb_array_elements_text(
            case
              when jsonb_typeof(v_elem->'alerts') = 'array' then v_elem->'alerts'
              else '[]'::jsonb
            end
          )
        ),
        '{}'::text[]
      )
    );
  end loop;
end;
$$;

revoke all on function public.submit_customer_signup(jsonb, jsonb) from public;
revoke all on function public.submit_customer_signup(jsonb, jsonb) from anon;
revoke all on function public.submit_customer_signup(jsonb, jsonb) from authenticated;
grant execute on function public.submit_customer_signup(jsonb, jsonb) to authenticated;
