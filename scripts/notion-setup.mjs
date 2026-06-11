#!/usr/bin/env node
/**
 * Setup de Notion para RestaurantQR
 * Crea: pagina raiz, bases de datos, documentacion
 */

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const API = 'https://api.notion.com/v1';

if (!NOTION_TOKEN) {
  console.error('Falta NOTION_TOKEN. Define la variable de entorno antes de ejecutar este script.');
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${NOTION_TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json'
};

async function createPage(parentId, title, icon = null, properties = {}, children = []) {
  const body = {
    parent: { page_id: parentId },
    properties: {
      title: { title: [{ text: { content: title } }] },
      ...properties
    }
  };
  if (icon) body.icon = { emoji: icon };
  if (children.length) body.children = children;

  const res = await fetch(`${API}/pages`, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(`createPage "${title}": ${JSON.stringify(data)}`);
  console.log(`  ✓ Page: "${title}" — ${data.id}`);
  return data;
}

async function createDatabase(parentId, title, icon, properties) {
  const body = {
    parent: { page_id: parentId },
    title: [{ type: 'text', text: { content: title } }],
    icon: { emoji: icon },
    properties
  };

  const res = await fetch(`${API}/databases`, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(`createDatabase "${title}": ${JSON.stringify(data)}`);
  console.log(`  ✓ Database: "${title}" — ${data.id}`);
  return data;
}

async function main() {
  console.log('\n🚀 RestaurantQR Notion Setup\n');

  // Pagina raiz proporcionada por el usuario
  const rootId = '36aaf9ebce0780818b17ff4a5609c0dd';
  console.log(`1. Usando pagina raiz: ${rootId}\n`);

  // 2. Crear bases de datos
  console.log('2. Creando bases de datos...');

  const tareasDb = await createDatabase(rootId, 'Tareas', '📋', {
    'Tarea': { title: {} },
    'Estado': { select: { options: [
      { name: 'Pendiente', color: 'gray' },
      { name: 'En progreso', color: 'blue' },
      { name: 'Bloqueado', color: 'red' },
      { name: 'Hecho', color: 'green' }
    ] }},
    'Prioridad': { select: { options: [
      { name: 'Alta', color: 'red' },
      { name: 'Media', color: 'yellow' },
      { name: 'Baja', color: 'gray' }
    ] }},
    'Fecha limite': { date: {} },
    'Cliente': { rich_text: {} },
    'Responsable': { people: {} },
    'Notas': { rich_text: {} }
  });

  const seguimientoDb = await createDatabase(rootId, 'Seguimiento Mensual', '💰', {
    'Mes': { title: {} },
    'Cliente': { rich_text: {} },
    'Plan': { select: { options: [
      { name: 'Basico $89K', color: 'green' },
      { name: 'Pro $149K', color: 'blue' },
      { name: 'Enterprise $249K', color: 'purple' }
    ] }},
    'Mensualidad cobrada': { checkbox: {} },
    'Monto COP': { number: { format: 'number' } },
    'Fecha de cobro': { date: {} },
    'Notas': { rich_text: {} }
  });

  console.log('');

  // 3. Crear paginas de documentacion
  console.log('3. Creando documentacion interna...');

  await createPage(rootId, 'Onboarding de Clientes', '📋', {}, [
    { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: 'Fase 1: Lead' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Registrar lead en Notion (si aun no existe)' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Enviar primer mensaje de aproximacion' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Agendar reunion de cierre (15-20 min)' } }] } },
    { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: 'Fase 2: Reunion de Cierre' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Preguntar: clientes al mes, usa WhatsApp Business, tiene programa de fidelidad?' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Mostrar demo: escanear QR, flujo de registro, mensaje de WhatsApp, dashboard' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Precios: Basico $89K / Pro $149K / Enterprise $249K COP/mes' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Setup unico: $200K-$500K COP (incluye configuracion + QRs + capacitacion)' } }] } },
    { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: 'Fase 3: Setup (2 dias)' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Dia 1: Recopilar datos, crear Supabase, configurar Twilio, personalizar branding' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Dia 2: Deploy Vercel, configurar recompensas, generar QRs, prueba end-to-end, capacitacion' } }] } },
    { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: 'Fase 4: Cliente Activo' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Revisar dashboard mensualmente' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Verificar saldo Twilio' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Enviar reporte mensual y cobrar' } }] } }
  ]);

  await createPage(rootId, 'Funcionamiento del Sistema', '⚙️', {}, [
    { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: 'Flujo del Cliente' } }] } },
    { object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: [{ text: { content: 'Cliente escanea QR en la mesa' } }] } },
    { object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: [{ text: { content: 'Ingresa nombre y celular (o usa datos guardados)' } }] } },
    { object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: [{ text: { content: 'Suma puntos aleatorios (40-65 pts por visita)' } }] } },
    { object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: [{ text: { content: 'Recibe mensaje de WhatsApp con saldo y proximo premio' } }] } },
    { object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: [{ text: { content: 'Al alcanzar un tier, elige premio seguro o Mystery Box' } }] } },
    { object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: [{ text: { content: 'Mesero escanea QR del cliente para verificar premio' } }] } },
    { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: 'Tiers de Recompensas' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Plata: 150 pts' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Oro: 300 pts' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Diamante: 450 pts' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'BLACK: 1000 pts (experiencia exclusiva)' } }] } },
    { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: 'Automatizaciones' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Cumpleanos: mensaje automatico a las 8am' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Reactivacion suave: dia 21 sin visitar' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Reactivacion agresiva: dia 25+ sin visitar' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Mystery Box: sistema de probabilidades por tier' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Golden Box: pity timer despues de 2 premios bajos seguidos' } }] } }
  ]);

  await createPage(rootId, 'Plataformas y Herramientas', '🛠️', {}, [
    { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: 'Infraestructura Tecnica' } }] } },
    { object: 'block', type: 'heading_3', heading_3: { rich_text: [{ text: { content: 'Vercel' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Hosting del dashboard y API (Next.js)' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Plan Hobby: gratis (hasta 100GB bandwidth)' } }] } },
    { object: 'block', type: 'heading_3', heading_3: { rich_text: [{ text: { content: 'Supabase' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Base de datos PostgreSQL por cliente' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Auth, RLS, storage' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Plan Free: 500MB, 2GB storage, 50K users' } }] } },
    { object: 'block', type: 'heading_3', heading_3: { rich_text: [{ text: { content: 'Twilio' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'WhatsApp Business API' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Plantillas aprobadas por Meta (24-72h)' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Costo: ~$0.005-0.015 USD por mensaje' } }] } },
    { object: 'block', type: 'heading_3', heading_3: { rich_text: [{ text: { content: 'n8n' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Automatizacion de crons (cumpleanos, reactivacion)' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Self-hosted en VPS compartido' } }] } },
    { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: 'Herramientas de Gestion' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Notion: CRM + tareas + documentacion (este workspace)' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'GitHub: repos separados por cliente' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Google Drive: logos, QRs, contratos' } }] } }
  ]);

  await createPage(rootId, 'Precios y Paquetes', '💵', {}, [
    { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: 'Planes Mensuales' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Basico: $89.000 COP/mes — hasta 200 clientes, 500 WhatsApp/mes, soporte email' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Pro: $149.000 COP/mes — ilimitado, campanas manuales, soporte prioritario' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Enterprise: $249.000 COP/mes — multi-sede, analytics avanzados, soporte 24/7' } }] } },
    { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: 'Setup Unico (one-time)' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Onboarding + Supabase/Vercel/Twilio: $150.000 - $300.000 COP' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Crear y aprobar plantillas WhatsApp: incluido' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Personalizar branding + logo + colores: incluido' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Configurar recompensas y beneficios BLACK: incluido' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Imprimir QRs por mesa: material aparte' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Capacitacion admin (dashboard, campanas): incluido' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'TOTAL: $200.000 - $500.000 COP (4-6 horas de trabajo)' } }] } }
  ]);

  await createPage(rootId, 'Costos del Negocio', '📊', {}, [
    { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: 'Costos por Cliente (USD/mes)' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Vercel Hobby: $0 (gratis hasta 100GB)' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Supabase Free: $0 (500MB DB, 2GB storage)' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Twilio WhatsApp: ~$5-15 USD/mes (pay-as-you-go)' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'VPS n8n (compartido 3-5 clientes): ~$3-5 USD/mes c/u' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Dominio: $0-1 USD/mes (subdomain gratis de Vercel)' } }] } },
    { object: 'block', type: 'heading_3', heading_3: { rich_text: [{ text: { content: 'Margen neto estimado' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Plan Basico: ~$77.000 COP/mes de margen' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Plan Pro: ~$137.000 COP/mes de margen' } }] } },
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Plan Enterprise: ~$237.000 COP/mes de margen' } }] } }
  ]);

  await createPage(rootId, 'Scripts y Templates', '📝', {}, [
    { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: 'Mensaje de Primera Aproximacion' } }] } },
    { object: 'block', type: 'quote', quote: { rich_text: [{ text: { content: 'Hola [Nombre], soy [tu nombre] de RestaurantQR.\n\nAyudamos a restaurantes como [Nombre restaurante] a que sus clientes vuelvan mas seguido con fidelidad por WhatsApp — sin apps, sin tarjetas.\n\nTienes 15 min esta semana para que te muestre como funciona? Es gratis y sin compromiso.' } }] } },
    { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: 'Mensaje de Seguimiento Setup' } }] } },
    { object: 'block', type: 'quote', quote: { rich_text: [{ text: { content: 'Hola [Nombre]! Feliz de que empecemos \uD83C\DF89\n\nPara configurar tu sistema necesito que me envies:\n\n1. Logo del restaurante (PNG)\n2. Colores de tu marca\n3. Cuantas mesas tienes?\n4. Numero de WhatsApp del negocio\n5. Clientes al mes aprox\n6. Link de Google Maps\n7. Recompensas que quieres dar\n8. Precio promedio del ticket\n\nCuando me envies todo, en 48h tu sistema esta listo.' } }] } },
    { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: 'Reporte Mensual al Cliente' } }] } },
    { object: 'block', type: 'quote', quote: { rich_text: [{ text: { content: 'Hola [Nombre]! \uD83D\uDC4B\n\nResumen de tu programa de fidelidad — [Mes]:\n\n\uD83C\DF89 [X] clientes nuevos registrados\n\uD83C\uDF63 [Y] visitas este mes\n\uD83D\uDCE9 [Z] mensajes enviados automaticamente\n\uD83D\uDCB0 Tu saldo de mensajes: $[saldo] USD\n\nTodo va bien. Necesitas ajustar algo para el proximo mes?' } }] } }
  ]);

  console.log('\n\n✅ Setup completo! Abre tu Notion y busca "RestaurantQR Operaciones"');
  console.log(`   URL: https://www.notion.so/${rootId.replace(/-/g, '')}\n`);
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
