-- Dummy training programme for tests: one week of activities, dated relative to the current
-- week (Singapore time) so the timetable is never empty. Loaded only by the fake Neon
-- (tests/fakes/neon.ts); never run it against a real database.

delete from events where comments like 'DEMO%';

with week as (select date_trunc('week', now() at time zone 'Asia/Singapore') as monday),
rows (day, start_t, end_t, all_day, title, cond, loc, resrc, category, companies) as (values
  (0, '07:00', '07:50', false, 'ORIENTATION RUN',        'A COMD',   'KHC',      null,          'Physical Training', array['Archer','Braves']),
  (0, '09:00', '11:50', false, 'UIP LESSONS',            'PL COMD',  'COYLINE',  'PROJECTOR',   null,                array['Archer']),
  (1, '08:00', '17:50', false, 'FIELD CAMP DAY 1',       'OC',       'PULAU TEKONG', 'FIELD PACK', 'Outfield',        array['Braves']),
  (1, '13:00', '14:50', false, 'IPPT',                   'PTI',      'STADIUM',  null,          'Physical Training', array['Cougar','Stallion']),
  (2, '07:00', '11:50', false, 'LIVE FIRING RANGE',      'RSO',      'RANGE 3',  'SAR 21, AMMO','Live Firing/HRA',   array['Archer']),
  (2, '13:00', '16:50', false, 'SAFETY BRIEF / ADMIN',   'CSM',      'AUDITORIUM', null,        null,                array['Hercules']),
  (3, '09:00', '15:50', false, 'EXTERNAL COURSE (SIGNALS)', 'SIG INSTR', 'SIGNALS INST', null,  'External Training', array['Stallion']),
  (3, '19:00', '21:50', false, 'NIGHT NAVIGATION',       'PL COMD',  'MANDAI',   'COMPASS',     'Outfield',          array['Cougar']),
  (4, '07:00', '07:50', false, 'ROUTE MARCH',            'A COMD',   'CAMP',     null,          'Physical Training', array['Archer','Braves','Cougar','Stallion','Hercules']),
  (4, '08:00', '10:50', false, 'VEHICLE MAINTENANCE',    'MTO',      'MT LINE',  'TOOLKIT',     null,                array['Hercules']),
  (5, '00:00', '00:00', true,  'BOOK OUT',               null,       null,       null,          'Off/Leave/Weekend', array['Archer','Braves','Cougar','Stallion','Hercules']),
  (0, '00:00', '00:00', true,  'ARMSKOTE REGISTRATION',  null,       null,       null,          null,                array['Archer'])
)
insert into events (title, start_at, end_at, all_day, cond, loc, resrc, comments, category, companies)
select title,
       (monday + day * interval '1 day' + start_t::time) at time zone 'Asia/Singapore',
       (monday + day * interval '1 day' + end_t::time) at time zone 'Asia/Singapore',
       all_day, cond, loc, resrc, 'DEMO', category, companies
from rows, week;
