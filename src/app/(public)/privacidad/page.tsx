import { getBrandingForHost } from '@/lib/branding-server'
import { ArrowLeft } from 'lucide-react'

export const metadata = {
  title: 'Política de Privacidad',
  robots: 'noindex',
}

export default async function PrivacidadPage() {
  const branding = await getBrandingForHost()
  const whatsappLink = branding.whatsappLink

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
            </ul>
          </section>

          <section>
            <h2 className="mb-2 font-semibold text-gray-900">3. Finalidad del tratamiento</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Gestionar tu participación en el programa de fidelización</li>
              <li>Enviarte comunicaciones sobre tus puntos, premios y beneficios vía WhatsApp</li>
              <li>Enviarte promociones, novedades y campañas del establecimiento vía WhatsApp</li>
              <li>Recordarte fechas especiales como tu cumpleaños</li>
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
              <li><strong>Presentar quejas</strong> ante la Superintendencia de Industria y Comercio (SIC)</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 font-semibold text-gray-900">6. Almacenamiento y seguridad</h2>
            <p>
              Tus datos se almacenan en servidores seguros con cifrado en tránsito y en reposo.
              No compartimos tu información con terceros para fines comerciales ajenos a este programa.
            </p>
          </section>

          <section>
            <h2 className="mb-2 font-semibold text-gray-900">7. Vigencia</h2>
            <p>
              Tus datos se conservan mientras estés activo en el programa o hasta que solicites
              su supresión.
            </p>
          </section>

          <section>
            <h2 className="mb-2 font-semibold text-gray-900">8. Contacto</h2>
            <p>
              Para ejercer tus derechos o resolver dudas sobre el tratamiento de tus datos,
              comunícate con nosotros
              {whatsappLink ? (
                <>
                  {' '}por{' '}
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-green-600 underline"
                  >
                    WhatsApp
                  </a>.
                </>
              ) : (
                ' directamente en el establecimiento.'
              )}
            </p>
          </section>

        </div>

        <p className="mt-10 text-center text-xs text-gray-400">
          Última actualización: junio 2025 · Ley 1581 de 2012 — Colombia
        </p>
      </div>
    </div>
  )
}
