create extension if not exists "uuid-ossp";

-- Auto-update function (shared across tables)
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Table 1: feeders (must come before dogs since dogs references it)
create table feeders (
  feeder_id          serial primary key,
  name               varchar(100) not null,
  phone              varchar(20),
  colony             varchar(255),
  rating             varchar(10) not null default 'unrated'
                     check (rating in ('good', 'bad', 'unrated')),
  rating_notes       text,
  location_latitude  decimal(10, 8),
  location_longitude decimal(11, 8),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger feeders_updated_at
  before update on feeders
  for each row execute procedure update_updated_at_column();

-- Table 2: dogs
create table dogs (
  dog_id             serial primary key,
  name               varchar(100) not null,
  date_of_birth      date,
  approx_age_months  integer,
  gender             varchar(10) not null default 'unknown'
                     check (gender in ('male', 'female', 'unknown')),
  location_latitude  decimal(10, 8),
  location_longitude decimal(11, 8),
  location_address   varchar(255),
  feeder_id          integer references feeders (feeder_id) on delete set null,
  feeder_phone       varchar(20),
  sterilized         boolean not null default false,
  sterilization_date date,
  current_status     varchar(50) not null default 'healthy'
                     check (current_status in ('healthy', 'needs_attention', 'critical', 'follow_up')),
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger dogs_updated_at
  before update on dogs
  for each row execute procedure update_updated_at_column();

-- Table 3: dog_photos
create table dog_photos (
  photo_id         serial primary key,
  dog_id           integer not null references dogs (dog_id) on delete cascade,
  photo_url        varchar(500) not null,
  uploaded_at      timestamptz not null default now(),
  is_profile_photo boolean not null default false
);

create unique index dog_photos_profile_unique
  on dog_photos (dog_id)
  where is_profile_photo = true;

-- Table 4: health_updates
create table health_updates (
  update_id   serial primary key,
  dog_id      integer not null references dogs (dog_id) on delete cascade,
  update_date date not null,
  status_note text not null,
  update_type varchar(50) not null default 'general'
              check (update_type in ('general', 'parvo', 'feeding', 'vomiting', 'other')),
  created_at  timestamptz not null default now()
);

-- Table 5: medical_records
create table medical_records (
  record_id     serial primary key,
  dog_id        integer not null references dogs (dog_id) on delete cascade,
  event_type    varchar(50) not null
                check (event_type in ('vaccination', 'deworming', 'rabies', 'sterilization', 'other')),
  event_name    varchar(100),
  date_given    date,
  next_due_date date,
  notes         text
);

-- Table 6: reminders
create table reminders (
  reminder_id       serial primary key,
  dog_id            integer not null references dogs (dog_id) on delete cascade,
  reminder_type     varchar(50) not null
                    check (reminder_type in ('6_month_check', 'vaccination', 'deworming', 'manual')),
  due_date          date not null,
  is_auto_generated boolean not null default false,
  status            varchar(20) not null default 'pending'
                    check (status in ('pending', 'completed', 'dismissed')),
  created_at        timestamptz not null default now()
);

-- Indexes
create index reminders_status_due on reminders (status, due_date);
create index health_updates_dog_date on health_updates (dog_id, update_date desc);
create index medical_records_dog on medical_records (dog_id, date_given desc);

-- RLS
alter table feeders enable row level security;
alter table dogs enable row level security;
alter table dog_photos enable row level security;
alter table health_updates enable row level security;
alter table medical_records enable row level security;
alter table reminders enable row level security;

create policy "Allow all" on feeders for all using (true) with check (true);
create policy "Allow all" on dogs for all using (true) with check (true);
create policy "Allow all" on dog_photos for all using (true) with check (true);
create policy "Allow all" on health_updates for all using (true) with check (true);
create policy "Allow all" on medical_records for all using (true) with check (true);
create policy "Allow all" on reminders for all using (true) with check (true);