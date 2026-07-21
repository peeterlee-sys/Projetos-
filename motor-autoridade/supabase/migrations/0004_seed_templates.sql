-- ============================================================================
-- Motor de Autoridade — 0004_seed_templates
-- Dados de referência (não simulados): templates visuais globais do design
-- system. Não cria clientes/usuários fictícios.
-- ============================================================================

insert into content_templates (tenant_id, name, format, dimensions, font_family, colors, text_positions, background, status)
values
  (null, 'Carrossel · Editorial Creme', 'carousel', '1080x1350', 'Instrument Sans',
   '{"bg":"#faf7f2","fg":"#1c1a16","accent":"#a87b2f"}',
   '{"headline":{"x":80,"y":140,"align":"left"},"phrase":{"x":80,"y":420,"align":"left"}}',
   '{"type":"solid","value":"#faf7f2"}', 'active'),

  (null, 'Carrossel · Floresta', 'carousel', '1080x1350', 'Newsreader',
   '{"bg":"#143627","fg":"#faf7f2","accent":"#e9c87b"}',
   '{"headline":{"x":80,"y":160,"align":"left"},"phrase":{"x":80,"y":460,"align":"left"}}',
   '{"type":"solid","value":"#143627"}', 'active'),

  (null, 'Post · Autoridade', 'post', '1080x1080', 'Newsreader',
   '{"bg":"#e7e1d6","fg":"#1c1a16","accent":"#a87b2f"}',
   '{"main_text":{"x":90,"y":360,"align":"center"}}',
   '{"type":"solid","value":"#e7e1d6"}', 'active'),

  (null, 'Story · Vertical Creme', 'story', '1080x1920', 'Instrument Sans',
   '{"bg":"#faf7f2","fg":"#1c1a16","accent":"#c9a94e"}',
   '{"text":{"x":80,"y":700,"align":"left"}}',
   '{"type":"solid","value":"#faf7f2"}', 'active')
on conflict do nothing;
