import { getBrandingForHost } from '@/lib/branding-server'
import { ArrowLeft } from 'lucide-react'

export const metadata = {
  title: 'Política de Privacidad',
  robots: 'noindex',
}

export default async function PrivacidadPage() {
  const branding = await getBrandingForHost()
  // Canal de contacto: WhatsApp si el negocio lo tiene; si no, Instagram (negocios
  // que solo atienden por redes). Sin ninguno, se remite al establecimiento.
  const contactLink = branding.whatsappLink ?? branding.instagramUrl
  const contactLabel = branding.whatsappLink ? 'WhatsApp' : 'Instagram'

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 shadow-sm">

        <a
          href="/check-in"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          Volver
        </a>

        <h1 className="mb-1 font-playfair text-2xl font-bold text-gray-900">
          Política de Privacidad
        </h1>
        <p className="mb-8 text-sm text-gray-500">{branding.name} — Programa de Fidelización</p>

        <div className="space-y-6 text-sm leading-relaxed text-gray-700">

          <section>
            <h2 className="mb-2 font-semibold text-gray-900">1. Responsable del tratamiento</h2>
            <p>
              <strong>{branding.name}</strong> es responsable del tratamiento de los datos personales
              recolectados a través del programa de fidelización, de conformidad con la Ley 1581 de 2012
              y el Decreto 1377 de 2013 de la República de Colombia.
            </p>
          </section>

          <section>
            <h2 className="mb-2 font-semibold text-gray-900">2. Datos que recolectamos</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Número de celular</li>
              <li>Nombre</li>
              <li>Fecha de nacimiento (opcional)</li>
              <li>Ciudad de residencia (opcional)</li>
              <li>Historial de visitas y puntos acumulados</li>
              <li>
                Datos de navegación en estas páginas (páginas vistas, si te registraste o
                hiciste check-in, tu dispositivo y tu dirección IP), recogidos por el
                píxel de Meta. Ver el punto 7.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 font-semibold text-gray-900">3. Finalidad del tratamiento</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Gestionar tu participación en el programa de fidelización</li>
              <li>Enviarte comunicaciones sobre tus puntos, premios y beneficios vía WhatsApp</li>
              <li>Enviarte promociones, novedades y campañas del establecimiento vía WhatsApp</li>
              <li>Recordarte fechas especiales como tu cumpleaños</li>
              <li>
                Medir y mejorar nuestras campañas publicitarias, y mostrarte anuncios
                relevantes en Facebook e Instagram (ver el punto 7)
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 font-semibold text-gray-900">4. Base legal</h2>
            <p>
              El tratamiento de tus datos se realiza con base en el consentimiento libre, previo,
              expreso e informado que otorgaste al registrarte en el programa.
            </p>
          </section>

          <section>
            <h2 className="mb-2 font-semibold text-gray-900">5. Tus derechos</h2>
            <p className="mb-2">
              Como titular de los datos personales tienes derecho a:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Conocer</strong> los datos que tenemos sobre ti</li>
              <li><strong>Actualizar</strong> o corregir tus datos</li>
              <li><strong>Suprimir</strong> tus datos de nuestra base</li>
              <li><strong>Revocar</strong> el consentimiento para recibir comunicaciones</li>
              <li><strong>Oponerte</strong> a la publicidad personalizada (ver el punto 7)</li>
              <li><strong>Presentar quejas</strong> ante la Superintendencia de Industria y Comercio (SIC)</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 font-semibold text-gray-900">6. Almacenamiento y seguridad</h2>
            <p>
              Tus datos se almacenan en servidores seguros con cifrado en tránsito y en reposo.
              No vendemos tu información ni la compartimos con terceros para fines ajenos a este
              programa. La única transmisión a un tercero es la que describe el punto 7: a Meta le
              llega tu número de celular cifrado, y nada más de lo que nos diste.
            </p>
          </section>

          <section>
            <h2 className="mb-2 font-semibold text-gray-900">7. Píxel de Meta y publicidad</h2>
            <p className="mb-2">
              Estas páginas usan el <strong>píxel de Meta</strong> (Facebook e Instagram), una
              herramienta de medición de Meta Platforms, Inc. Nos permite saber cuántas personas
              abren el enlace, cuántas se registran y cuántas hacen check-in, medir si nuestras
              campañas funcionan y mostrarle anuncios a quien ya nos conoce.
            </p>
            <p className="mb-2">
              <strong>Qué le mandamos a Meta:</strong> el hecho de que ocurrió una visita, un
              registro o un check-in, junto con el establecimiento y la sede; y, cuando te registrás
              o hacés check-in, <strong>tu número de celular cifrado</strong> (con el algoritmo
              SHA-256, que no se puede deshacer). Meta compara ese cifrado con el de los números que
              ya tiene y así reconoce que sos cliente de este establecimiento, aunque tu navegador
              bloquee el píxel. Meta, por su cuenta y como cualquier sitio web, recibe además tu
              dirección IP, tu tipo de dispositivo y las cookies que ya tuvieras suyas.
            </p>
            <p className="mb-2">
              <strong>Qué NO le mandamos:</strong> tu nombre, tu correo, tu fecha de nacimiento, tu
              ciudad ni tu historial de puntos y premios. Esos datos se quedan en el programa de
              fidelización.
            </p>
            <p className="mb-2">
              <strong>Para qué:</strong> medir si nuestras campañas funcionan, mostrarte anuncios del
              establecimiento en Facebook e Instagram, y encontrar personas con intereses parecidos a
              los de nuestros clientes. Lo aceptás en la casilla al registrarte; sin esa aceptación no
              te registramos, porque el programa y la medición van juntos.
            </p>
            <p className="mb-2">
              Meta trata esa información como responsable independiente, conforme a sus propias
              políticas. Podés consultarlas y controlar qué anuncios ves en{' '}
              <a
                href="https://www.facebook.com/privacy/policy"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-green-600 underline"
              >
                la política de privacidad de Meta
              </a>{' '}
              y en{' '}
              <a
                href="https://accountscenter.facebook.com/ad_preferences"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-green-600 underline"
              >
                tus preferencias de anuncios
              </a>.
            </p>
            <p>
              <strong>Cómo revocarlo:</strong> bloquear las cookies desde tu navegador apaga la parte
              que corre en tu dispositivo, pero no la que enviamos nosotros con tu celular cifrado.
              Para que dejemos de enviarla, pedinos la supresión de tus datos por el canal del punto 9:
              al salir del programa dejamos de mandar cualquier cosa tuya a Meta. También podés pedirle
              a Meta que borre lo que ya tiene desde tus preferencias de anuncios. Las pantallas de uso
              interno del personal del establecimiento no llevan píxel ni envían nada.
            </p>
          </section>

          <section>
            <h2 className="mb-2 font-semibold text-gray-900">8. Vigencia</h2>
            <p>
              Tus datos se conservan mientras estés activo en el programa o hasta que solicites
              su supresión.
            </p>
          </section>

          <section>
            <h2 className="mb-2 font-semibold text-gray-900">9. Contacto</h2>
            <p>
              Para ejercer tus derechos o resolver dudas sobre el tratamiento de tus datos,
              comunícate con nosotros
              {contactLink ? (
                <>
                  {' '}por{' '}
                  <a
                    href={contactLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-green-600 underline"
                  >
                    {contactLabel}
                  </a>.
                </>
              ) : (
                ' directamente en el establecimiento.'
              )}
            </p>
          </section>

        </div>

        <p className="mt-10 text-center text-xs text-gray-400">
          Última actualización: septiembre de 2026 · Ley 1581 de 2012 — Colombia
        </p>
      </div>
    </div>
  )
}
