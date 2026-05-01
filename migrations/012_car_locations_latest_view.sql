-- Latest car position per driver for the live track map.
-- The frontend used to SELECT … ORDER BY date DESC LIMIT 500 against
-- car_locations and relied on every driver appearing in the most recent
-- batch. At ~80 rows/sec across 22 drivers that should hold, but during
-- bursty insert ticks one chunk can dominate and the map renders fewer
-- than 20 dots. This function uses DISTINCT ON to guarantee one row per
-- driver, fast against idx_car_loc_session(session_key, driver_number,
-- date DESC).
--
-- Why a function and not a view: a view with DISTINCT ON isn't
-- guaranteed to push WHERE clauses into the inner query, which would
-- force a DISTINCT ON over every row in car_locations on each call.
-- Wrapping in a SQL function with the WHERE inside makes the index
-- access plan explicit.

CREATE OR REPLACE FUNCTION public.car_locations_latest(p_session_key int)
RETURNS TABLE(driver_number int, x int, y int, z int, "date" timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT DISTINCT ON (driver_number) driver_number, x, y, z, date
  FROM car_locations
  WHERE session_key = p_session_key
  ORDER BY driver_number, date DESC;
$$;

-- car_locations already has a public-read RLS policy so anon callers can
-- read the underlying rows. Grant EXECUTE on the function to anon for
-- frontend access via supabase-js .rpc().
GRANT EXECUTE ON FUNCTION public.car_locations_latest(int) TO anon, authenticated;
