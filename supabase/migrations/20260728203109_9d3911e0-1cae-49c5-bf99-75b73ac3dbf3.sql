REVOKE ALL ON FUNCTION public.moderate_price_report() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_report_points() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_list_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_list_owner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_list_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_list_owner(uuid, uuid) TO authenticated;