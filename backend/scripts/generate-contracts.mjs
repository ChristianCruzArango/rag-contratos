/**
 * Genera 10 contratos sintéticos en PDF de ~100 páginas cada uno para el RAG.
 *
 *   node scripts/generate-contracts.mjs [--pages 100] [--out ../seed-data] [--txt]
 *
 * Son documentos FICTICIOS para pruebas: las partes, cifras y hechos son
 * inventados y cada contrato tiene datos únicos y verificables, de modo que
 * se puede comprobar si el RAG recupera el fragmento correcto.
 */
import { writeFileSync, mkdirSync, createWriteStream, statSync } from 'node:fs';
import PDFDocument from 'pdfkit';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const getArg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : def;
};
const PAGES = parseInt(getArg('pages', '100'), 10);
const WORDS_PER_PAGE = 500;
const TARGET_WORDS = PAGES * WORDS_PER_PAGE;
const OUT_DIR = resolve(__dirname, getArg('out', '../../seed-data'));

/* ---------------------------------------------------------------- PRNG */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rnd = mulberry32(1);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
const money = (min, max) =>
  (Math.round(int(min, max) / 1000) * 1000).toLocaleString('es-CO');
const shuffle = (a) => {
  const c = [...a];
  for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
  return c;
};

/* ------------------------------------------------------------ catálogos */
const CIUDADES = ['Bogotá D.C.', 'Medellín', 'Cali', 'Barranquilla', 'Bucaramanga', 'Cartagena', 'Pereira', 'Manizales', 'Cúcuta', 'Ibagué'];
const NOMBRES = ['Laura Restrepo Ocampo', 'Andrés Felipe Gutiérrez Mora', 'Camila Andrea Salazar Ruiz', 'Jorge Iván Betancur Osorio', 'María Fernanda Villalba Pinto', 'Ricardo Alfonso Mejía Cárdenas', 'Diana Carolina Pineda Rojas', 'Sebastián Hoyos Arango', 'Paula Andrea Cifuentes Loaiza', 'Óscar Eduardo Naranjo Vélez', 'Valentina Escobar Quintero', 'Juan Manuel Ardila Peña'];
const EMPRESAS = ['Inversiones Andinas del Norte S.A.S.', 'Grupo Legal Corporativo Serrano & Asociados S.A.S.', 'Textiles del Pacífico Ltda.', 'Constructora Meridiano S.A.', 'Logística Integral Cumbre S.A.S.', 'Tecnologías Vertex Colombia S.A.S.', 'Agroindustrias La Esperanza S.A.S.', 'Servicios Financieros Ribera S.A.', 'Distribuidora Altamar S.A.S.', 'Clínica Santa Amalia S.A.'];
const BANCOS = ['Bancolombia', 'Banco de Bogotá', 'Davivienda', 'BBVA Colombia', 'Banco de Occidente', 'Scotiabank Colpatria'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const ORD = ['PRIMERA','SEGUNDA','TERCERA','CUARTA','QUINTA','SEXTA','SÉPTIMA','OCTAVA','NOVENA','DÉCIMA','DÉCIMA PRIMERA','DÉCIMA SEGUNDA','DÉCIMA TERCERA','DÉCIMA CUARTA','DÉCIMA QUINTA','DÉCIMA SEXTA','DÉCIMA SÉPTIMA','DÉCIMA OCTAVA','DÉCIMA NOVENA','VIGÉSIMA'];

function ordinal(n) {
  if (n <= 20) return ORD[n - 1];
  const dec = ['','','VIGÉSIMA','TRIGÉSIMA','CUADRAGÉSIMA','QUINCUAGÉSIMA','SEXAGÉSIMA','SEPTUAGÉSIMA','OCTOGÉSIMA','NONAGÉSIMA'];
  const uni = ['','PRIMERA','SEGUNDA','TERCERA','CUARTA','QUINTA','SEXTA','SÉPTIMA','OCTAVA','NOVENA'];
  if (n === 100) return 'CENTÉSIMA';
  const d = Math.floor(n / 10), u = n % 10;
  return u === 0 ? dec[d] : `${dec[d]} ${uni[u]}`;
}
const fecha = () => `${int(1, 28)} de ${pick(MESES)} de ${int(2023, 2026)}`;
const nit = () => `${int(800, 901)}.${int(100, 999)}.${int(100, 999)}-${int(0, 9)}`;
const cedula = () => `${int(10, 99)}.${int(100, 999)}.${int(100, 999)}`;

/* ------------------------------------------------- bancos de redacción */
const CONECTORES = ['En consecuencia,', 'Por lo anterior,', 'Sin perjuicio de lo previsto en el numeral anterior,', 'Para todos los efectos legales,', 'De conformidad con lo pactado,', 'En concordancia con la cláusula precedente,', 'Salvo pacto escrito en contrario,', 'Con sujeción a la normatividad vigente,', 'Bajo la gravedad de juramento, las Partes declaran que', 'Para efectos de la ejecución del presente Contrato,'];
const VERBOS_OBL = ['se obliga a', 'deberá', 'se compromete de manera irrevocable a', 'asume la obligación de', 'estará obligada a', 'tendrá el deber de'];
const PLAZOS = ['dentro de los cinco (5) días hábiles siguientes', 'en un término máximo de diez (10) días calendario', 'de manera inmediata y a más tardar dentro de las cuarenta y ocho (48) horas siguientes', 'dentro de los treinta (30) días calendario siguientes', 'dentro de los quince (15) días hábiles posteriores', 'antes del vencimiento del término previsto'];
const FUENTES = ['el Código Civil colombiano', 'el Código de Comercio', 'la Ley 1564 de 2012 (Código General del Proceso)', 'la Ley 1581 de 2012 y el Decreto 1074 de 2015', 'la Ley 820 de 2003', 'el Código Sustantivo del Trabajo', 'la Ley 1480 de 2011 (Estatuto del Consumidor)', 'la Ley 1266 de 2008', 'la Ley 2300 de 2023', 'la jurisprudencia vigente de la Corte Suprema de Justicia'];
const CONSECUENCIAS = ['constituirá incumplimiento grave y dará lugar a la terminación unilateral del Contrato', 'facultará a la parte cumplida para exigir la cláusula penal pactada', 'generará intereses moratorios a la tasa máxima legalmente permitida', 'dará lugar al cobro de la garantía constituida', 'habilitará el ejercicio de las acciones judiciales correspondientes', 'se entenderá como una causal objetiva de terminación'];

/* ----------------------------------------------- generador de párrafos */
function parrafoObligacion(ctx, tema) {
  const v = [
    `${pick(CONECTORES)} ${pick([ctx.A, ctx.B])} ${pick(VERBOS_OBL)} ${tema}, ${pick(PLAZOS)}, sin que dicha actuación genere costo adicional para la contraparte.`,
    `${pick([ctx.A, ctx.B])} ${pick(VERBOS_OBL)} ${tema}. El incumplimiento de esta obligación ${pick(CONSECUENCIAS)}, conforme a lo dispuesto en ${pick(FUENTES)}.`,
    `Las Partes acuerdan que ${tema} constituye una obligación de resultado y no de medio. Su verificación se realizará mediante acta suscrita por los supervisores designados en la Cláusula de Supervisión.`,
    `${pick(CONECTORES)} las Partes reconocen que ${tema} es elemento esencial del presente Contrato, de manera que su desatención ${pick(CONSECUENCIAS)}.`,
    `Corresponde a ${pick([ctx.A, ctx.B])} ${tema}, para lo cual dispondrá del personal, los equipos y los recursos técnicos y financieros necesarios, ${pick(PLAZOS)}.`,
    `Queda expresamente convenido que ${tema}. Cualquier modificación a esta previsión requerirá otrosí suscrito por los representantes legales de ambas Partes.`,
  ];
  return pick(v);
}
function parrafoEconomico(ctx) {
  const v = [
    `El valor correspondiente asciende a la suma de $${money(500000, 95000000)} M/CTE, pagadero mediante transferencia electrónica a la cuenta ${pick(['de ahorros','corriente'])} No. ${int(100,999)}-${int(100000,999999)}-${int(10,99)} de ${pick(BANCOS)}, previa presentación de la factura electrónica correspondiente.`,
    `Sobre el valor pactado se aplicarán las retenciones de ley vigentes al momento del pago, incluyendo retención en la fuente a la tarifa del ${pick(['4%','6%','11%','2.5%'])}, retención de ICA a la tarifa de ${int(4,11)} por mil y las demás que resulten aplicables.`,
    `El valor se reajustará anualmente en un porcentaje equivalente al IPC certificado por el DANE para el año inmediatamente anterior, más ${pick(['cero (0)','uno (1)','dos (2)','tres (3)'])} puntos porcentuales, sin que el incremento supere el límite legal aplicable.`,
    `La mora en el pago causará intereses a la tasa máxima legal permitida, certificada por la Superintendencia Financiera de Colombia, liquidados día por día desde el vencimiento y hasta la fecha efectiva del pago.`,
    `Las Partes dejan constancia de que el valor pactado incluye la totalidad de costos directos e indirectos, tributos, contribuciones, gastos de administración y utilidad, por lo que no habrá lugar a reconocimientos adicionales.`,
  ];
  return pick(v);
}
function parrafoGeneral(ctx, tema) {
  const v = [
    `${pick(CONECTORES)} se entenderá que ${tema}, sin perjuicio de las facultades de inspección y verificación que asisten a ${pick([ctx.A, ctx.B])}.`,
    `Para la interpretación de esta cláusula las Partes se remiten a ${pick(FUENTES)} y, en lo no previsto, a los usos y costumbres mercantiles del sector.`,
    `Cualquier controversia derivada de ${tema} se someterá al procedimiento de solución de conflictos previsto en este Contrato, agotando previamente la etapa de arreglo directo.`,
    `Las comunicaciones relativas a ${tema} se surtirán por escrito a las direcciones registradas en la Cláusula de Notificaciones y se entenderán recibidas al día hábil siguiente a su envío.`,
    `La tolerancia de una de las Partes frente a ${tema} no constituirá renuncia, modificación ni novación de las obligaciones aquí contraídas.`,
  ];
  return pick(v);
}

/* -------------------------------------------------- tipos de contrato */
const TIPOS = [
  {
    key: 'arrendamiento-vivienda', docType: 'arrendamiento',
    titulo: 'CONTRATO DE ARRENDAMIENTO DE VIVIENDA URBANA',
    rolA: 'EL ARRENDADOR', rolB: 'EL ARRENDATARIO',
    objeto: 'la entrega material a título de arrendamiento del inmueble destinado a vivienda urbana',
    temas: ['la entrega del inmueble en buen estado de servicio, seguridad y sanidad', 'el pago oportuno del canon de arrendamiento', 'la conservación del inmueble y sus instalaciones hidráulicas, eléctricas y sanitarias', 'la constitución de garantía o codeudor solidario', 'el pago de los servicios públicos domiciliarios y de las expensas comunes', 'la restricción de subarrendar o ceder el contrato sin autorización escrita', 'la realización de reparaciones locativas a cargo del arrendatario', 'la realización de reparaciones necesarias a cargo del arrendador', 'la restitución del inmueble al vencimiento del término', 'el respeto al reglamento de propiedad horizontal y al manual de convivencia', 'la prohibición de destinar el inmueble a un uso distinto al de vivienda', 'la autorización de visitas de inspección con preaviso', 'el procedimiento de terminación unilateral con indemnización', 'la actualización anual del canon conforme al IPC', 'el depósito y devolución del inventario de bienes muebles'],
    anexos: ['INVENTARIO DETALLADO DEL INMUEBLE Y SUS ACABADOS', 'ACTA DE ENTREGA Y ESTADO DE SERVICIOS PÚBLICOS', 'REGLAMENTO DE PROPIEDAD HORIZONTAL - EXTRACTO', 'TABLA DE REAJUSTE DEL CANON POR ANUALIDADES'],
  },
  {
    key: 'arrendamiento-local', docType: 'arrendamiento',
    titulo: 'CONTRATO DE ARRENDAMIENTO DE LOCAL COMERCIAL',
    rolA: 'EL ARRENDADOR', rolB: 'EL ARRENDATARIO',
    objeto: 'la entrega a título de arrendamiento de un local comercial destinado a la explotación de un establecimiento de comercio',
    temas: ['la destinación exclusiva del local a la actividad comercial autorizada', 'la renovación del contrato conforme al artículo 518 del Código de Comercio', 'el desahucio y el derecho de preferencia del arrendatario', 'las mejoras útiles y necesarias y su reconocimiento', 'la obtención de licencias, permisos y matrícula mercantil', 'el cumplimiento de normas de uso de suelo y de seguridad industrial', 'la contratación de pólizas de incendio, terremoto y responsabilidad civil extracontractual', 'el pago de la cuota de administración del centro comercial', 'la participación en campañas del fondo de mercadeo', 'el horario mínimo de apertura al público', 'la prohibición de ceder el local sin enajenación del establecimiento de comercio', 'la instalación de avisos, vitrinas y publicidad exterior visual', 'el manejo de residuos y el cumplimiento de normas ambientales', 'la restitución del local con las adecuaciones retiradas'],
    anexos: ['PLANO Y LINDEROS DEL LOCAL ARRENDADO', 'MANUAL DE OPERACIÓN DEL CENTRO COMERCIAL', 'CUADRO DE CÁNONES ESCALONADOS Y RENTA VARIABLE', 'PÓLIZAS EXIGIDAS Y COBERTURAS MÍNIMAS'],
  },
  {
    key: 'laboral-indefinido', docType: 'laboral',
    titulo: 'CONTRATO INDIVIDUAL DE TRABAJO A TÉRMINO INDEFINIDO',
    rolA: 'EL EMPLEADOR', rolB: 'EL TRABAJADOR',
    objeto: 'la prestación personal del servicio en forma subordinada a cambio de una remuneración',
    temas: ['el cumplimiento de la jornada laboral y el registro de tiempos', 'el pago del salario y de las prestaciones sociales legales', 'la afiliación al Sistema de Seguridad Social Integral', 'el cumplimiento del reglamento interno de trabajo', 'la reserva y confidencialidad de la información empresarial', 'la cesión de derechos patrimoniales sobre obras y desarrollos', 'el período de prueba y sus efectos', 'las causales de terminación con justa causa', 'el pago de horas extras, recargos nocturnos, dominicales y festivos', 'la dotación de calzado y vestido de labor', 'la participación en el Sistema de Gestión de Seguridad y Salud en el Trabajo', 'la prevención del acoso laboral y el Comité de Convivencia', 'la política de teletrabajo y trabajo en casa', 'el manejo de comisiones y bonificaciones no constitutivas de salario', 'la cláusula de exclusividad y no concurrencia'],
    anexos: ['DESCRIPCIÓN DETALLADA DEL CARGO Y FUNCIONES', 'ESCALA SALARIAL Y ESQUEMA DE COMISIONES', 'REGLAMENTO INTERNO DE TRABAJO - EXTRACTO', 'POLÍTICA DE TRATAMIENTO DE DATOS DE EMPLEADOS'],
  },
  {
    key: 'laboral-fijo', docType: 'laboral',
    titulo: 'CONTRATO INDIVIDUAL DE TRABAJO A TÉRMINO FIJO INFERIOR A UN AÑO',
    rolA: 'EL EMPLEADOR', rolB: 'EL TRABAJADOR',
    objeto: 'la prestación personal del servicio por un término fijo determinado, prorrogable conforme a la ley',
    temas: ['el preaviso de no prórroga con treinta (30) días de antelación', 'el límite legal de tres (3) prórrogas sucesivas', 'la liquidación proporcional de prestaciones sociales', 'el pago de la indemnización por terminación anticipada sin justa causa', 'el suministro de elementos de protección personal', 'la capacitación en riesgos laborales y el examen médico ocupacional', 'la estabilidad laboral reforzada y sus supuestos', 'el traslado y las modificaciones de las condiciones laborales', 'la política disciplinaria y el procedimiento de descargos', 'el uso de herramientas tecnológicas de propiedad del empleador', 'el reporte de accidentes de trabajo ante la ARL', 'las vacaciones y su compensación en dinero', 'el descuento autorizado por libranza', 'la entrega del paz y salvo al finalizar el vínculo'],
    anexos: ['CRONOGRAMA DE TURNOS Y JORNADA', 'MATRIZ DE PELIGROS Y RIESGOS DEL CARGO', 'FORMATO DE ENTREGA DE ELEMENTOS DE PROTECCIÓN PERSONAL', 'PROCEDIMIENTO DISCIPLINARIO INTERNO'],
  },
  {
    key: 'servicios-juridicos', docType: 'juridico',
    titulo: 'CONTRATO DE PRESTACIÓN DE SERVICIOS PROFESIONALES JURÍDICOS',
    rolA: 'EL CLIENTE', rolB: 'EL APODERADO',
    objeto: 'la prestación de servicios de asesoría y representación jurídica en los asuntos encomendados',
    temas: ['la representación judicial y extrajudicial del cliente', 'la elaboración de conceptos y memoriales', 'el deber de secreto profesional del abogado', 'la prohibición de conflicto de intereses y el deber de revelación', 'el régimen disciplinario de la Ley 1123 de 2007', 'la rendición periódica de cuentas del estado de los procesos', 'la sustitución del poder y sus límites', 'la autorización para transigir, desistir o conciliar', 'la liquidación y pago de honorarios por etapas procesales', 'el reembolso de gastos, expensas y agencias en derecho', 'la terminación del mandato por renuncia o revocatoria', 'la custodia y devolución del expediente y los documentos originales', 'la responsabilidad profesional y la póliza de amparo', 'la atención de audiencias virtuales y presenciales'],
    anexos: ['RELACIÓN DE PROCESOS Y RADICADOS ASIGNADOS', 'TARIFARIO DE HONORARIOS POR ACTUACIÓN PROCESAL', 'PROTOCOLO DE REPORTE AL CLIENTE', 'FORMATO DE PODER GENERAL Y ESPECIAL'],
  },
  {
    key: 'cuota-litis', docType: 'juridico',
    titulo: 'CONTRATO DE HONORARIOS PROFESIONALES BAJO MODALIDAD DE CUOTA LITIS',
    rolA: 'EL PODERDANTE', rolB: 'EL ABOGADO',
    objeto: 'la representación judicial con honorarios pactados como porcentaje del beneficio económico efectivamente obtenido',
    temas: ['la determinación del porcentaje de participación sobre el resultado', 'la base de liquidación del beneficio económico', 'la asunción de gastos procesales y su reembolso preferente', 'el momento de causación y exigibilidad de los honorarios', 'la prohibición de pactar sobre el objeto litigioso en exceso de los límites legales', 'la revocatoria del poder y la liquidación proporcional', 'la transacción o conciliación sin autorización del abogado', 'el desistimiento del proceso por parte del poderdante', 'el derecho de retención sobre las sumas recaudadas', 'la cesión del crédito litigioso a terceros', 'la información periódica sobre riesgos procesales', 'el destino de las agencias en derecho y costas decretadas', 'la actuación en segunda instancia y recursos extraordinarios'],
    anexos: ['MATRIZ DE RIESGO PROCESAL Y PROBABILIDAD DE ÉXITO', 'PROYECCIÓN DE ESCENARIOS DE LIQUIDACIÓN', 'RELACIÓN DE GASTOS PROCESALES ESTIMADOS', 'FORMATO DE RENDICIÓN DE CUENTAS'],
  },
  {
    key: 'confidencialidad-nda', docType: 'confidencialidad',
    titulo: 'ACUERDO DE CONFIDENCIALIDAD Y NO DIVULGACIÓN (NDA MUTUO)',
    rolA: 'LA PARTE REVELADORA', rolB: 'LA PARTE RECEPTORA',
    objeto: 'la protección recíproca de la información confidencial intercambiada con ocasión de la relación comercial',
    temas: ['la definición y alcance de la Información Confidencial', 'las excepciones al deber de confidencialidad', 'el estándar de custodia y las medidas técnicas exigibles', 'la limitación del acceso al personal con necesidad de conocer', 'la devolución o destrucción certificada de la información', 'la vigencia del deber de reserva tras la terminación', 'la revelación obligada por orden de autoridad competente', 'la prohibición de ingeniería inversa y descompilación', 'la no concesión de licencias sobre propiedad intelectual', 'la notificación inmediata de incidentes de seguridad', 'la cláusula penal por divulgación no autorizada', 'la no solicitación de empleados y clientes', 'las medidas cautelares y la tutela judicial efectiva'],
    anexos: ['CLASIFICACIÓN DE LA INFORMACIÓN POR NIVELES DE SENSIBILIDAD', 'CONTROLES TÉCNICOS MÍNIMOS EXIGIDOS', 'FORMATO DE CERTIFICACIÓN DE DESTRUCCIÓN', 'REGISTRO DE PERSONAS AUTORIZADAS'],
  },
  {
    key: 'servicios-tecnologia', docType: 'servicios',
    titulo: 'CONTRATO DE PRESTACIÓN DE SERVICIOS DE DESARROLLO DE SOFTWARE Y TRATAMIENTO DE DATOS',
    rolA: 'EL CONTRATANTE', rolB: 'EL CONTRATISTA',
    objeto: 'el diseño, desarrollo, implementación y soporte de una solución de software a la medida',
    temas: ['la definición de alcance funcional y criterios de aceptación', 'la entrega de hitos y el procedimiento de recepción', 'los niveles de servicio (ANS) y los tiempos de respuesta', 'la cesión de derechos patrimoniales de autor sobre el software', 'el uso de componentes de código abierto y sus licencias', 'el rol de encargado del tratamiento de datos personales', 'las medidas de seguridad de la información y cifrado', 'la notificación de incidentes a la Superintendencia de Industria y Comercio', 'la transferencia internacional de datos personales', 'la continuidad del negocio y los planes de recuperación', 'el control de cambios y las solicitudes fuera de alcance', 'la garantía de corrección de defectos y el período de estabilización', 'el escrow de código fuente', 'la reversión y entrega ordenada al finalizar el contrato'],
    anexos: ['ESPECIFICACIÓN FUNCIONAL Y CASOS DE USO', 'ACUERDO DE NIVELES DE SERVICIO CON INDICADORES', 'ANEXO DE TRATAMIENTO DE DATOS PERSONALES', 'PLAN DE PRUEBAS Y CRITERIOS DE ACEPTACIÓN'],
  },
  {
    key: 'suministro-mercantil', docType: 'comercial',
    titulo: 'CONTRATO DE SUMINISTRO MERCANTIL DE BIENES',
    rolA: 'EL PROVEEDOR', rolB: 'EL COMPRADOR',
    objeto: 'el suministro periódico y continuado de bienes conforme a las órdenes de compra emitidas',
    temas: ['la emisión y aceptación de órdenes de compra', 'los plazos de entrega y el lugar de cumplimiento', 'la transferencia del riesgo y la propiedad de la mercancía', 'el control de calidad y el procedimiento de rechazo', 'las garantías de calidad, idoneidad y seguridad del producto', 'la reposición de productos defectuosos', 'las condiciones de empaque, rotulado y trazabilidad', 'la exclusividad territorial y su alcance', 'los descuentos por volumen y pronto pago', 'la constitución de garantías bancarias de cumplimiento', 'el cumplimiento normativo en materia de competencia', 'las políticas anticorrupción y de prevención de lavado de activos', 'la responsabilidad frente a terceros consumidores', 'la terminación por desabastecimiento o fuerza mayor'],
    anexos: ['LISTA DE PRECIOS Y REFERENCIAS', 'ESPECIFICACIONES TÉCNICAS DE LOS BIENES', 'PROTOCOLO DE INSPECCIÓN Y MUESTREO', 'CRONOGRAMA DE ENTREGAS PROGRAMADAS'],
  },
  {
    key: 'mandato-representacion', docType: 'juridico',
    titulo: 'CONTRATO DE MANDATO CON REPRESENTACIÓN PARA GESTIÓN JURÍDICA Y ADMINISTRATIVA',
    rolA: 'EL MANDANTE', rolB: 'EL MANDATARIO',
    objeto: 'la gestión de negocios jurídicos y trámites administrativos por cuenta y en nombre del mandante',
    temas: ['el alcance y los límites de las facultades conferidas', 'la prohibición de autocontratación sin autorización expresa', 'la rendición de cuentas comprobada de la gestión', 'la obligación de ceñirse a las instrucciones del mandante', 'la responsabilidad por culpa leve en la gestión', 'la delegación del mandato y la responsabilidad del sustituto', 'la provisión de fondos para la gestión encomendada', 'la remuneración del mandatario y su causación', 'la revocatoria del mandato y sus efectos frente a terceros', 'la renuncia del mandatario y el deber de continuidad', 'la representación ante entidades públicas y notarías', 'el manejo de dineros recaudados y cuentas separadas', 'la terminación por muerte, interdicción o insolvencia'],
    anexos: ['RELACIÓN DE FACULTADES ESPECIALES CONFERIDAS', 'FORMATO DE RENDICIÓN DE CUENTAS MENSUAL', 'LISTADO DE TRÁMITES Y ENTIDADES', 'PRESUPUESTO DE GASTOS DE GESTIÓN'],
  },
];

/* ------------------------------------------------------- DEFINICIONES */
const DEFINICIONES_BASE = [
  ['Acta de Inicio', 'documento suscrito por las Partes en el cual se deja constancia de la fecha a partir de la cual comienza la ejecución material de las obligaciones.'],
  ['Anexo', 'todo documento que se incorpora al presente Contrato y que forma parte integral e inseparable del mismo.'],
  ['Caso Fortuito o Fuerza Mayor', 'el imprevisto imposible de resistir conforme a la definición del artículo 64 del Código Civil, subrogado por el artículo 1 de la Ley 95 de 1890.'],
  ['Día Hábil', 'cualquier día distinto de sábado, domingo o festivo en la República de Colombia.'],
  ['Información Confidencial', 'toda información de carácter técnico, comercial, financiero, jurídico o estratégico que una Parte revele a la otra, cualquiera sea su soporte.'],
  ['Datos Personales', 'cualquier información vinculada o que pueda asociarse a una o varias personas naturales determinadas o determinables.'],
  ['Incumplimiento Grave', 'la inobservancia de cualquiera de las obligaciones calificadas como esenciales en este Contrato, o la reiteración de incumplimientos leves.'],
  ['Notificación', 'toda comunicación escrita remitida conforme al procedimiento de la Cláusula de Notificaciones.'],
  ['Otrosí', 'documento modificatorio del Contrato suscrito por los representantes legales de las Partes.'],
  ['Parte', 'indistintamente cualquiera de los suscriptores del presente Contrato; "Partes" se refiere a ambos conjuntamente.'],
  ['Salario Mínimo Legal Mensual Vigente (SMLMV)', 'el salario mínimo fijado por el Gobierno Nacional para el año en que se realice la liquidación correspondiente.'],
  ['Supervisor', 'la persona designada por cada Parte para verificar la correcta ejecución de las obligaciones contractuales.'],
  ['Garantía', 'el instrumento constituido para amparar el cumplimiento de las obligaciones, en los términos de la cláusula respectiva.'],
  ['Entregable', 'cada uno de los productos, bienes, informes o servicios que deben ser puestos a disposición conforme al cronograma.'],
  ['Cláusula Penal', 'la estimación anticipada de perjuicios pactada por las Partes, sin perjuicio del cobro de la obligación principal.'],
  ['Autoridad Competente', 'cualquier entidad administrativa, judicial o de control con jurisdicción sobre las Partes o sobre el objeto contractual.'],
  ['Normatividad Aplicable', 'el conjunto de leyes, decretos, resoluciones y actos administrativos vigentes en Colombia que resulten aplicables.'],
  ['Precio', 'la contraprestación económica pactada, incluidos impuestos, tasas y contribuciones, salvo indicación expresa en contrario.'],
  ['Plazo de Ejecución', 'el término durante el cual las Partes deben cumplir las obligaciones a su cargo.'],
  ['Conflicto de Interés', 'toda situación en la que el interés particular de una Parte o de sus dependientes pueda afectar la objetividad de la ejecución contractual.'],
  ['Subcontratista', 'el tercero vinculado por una de las Partes para la ejecución parcial de las obligaciones, bajo su exclusiva responsabilidad.'],
  ['Acta de Liquidación', 'documento en el que las Partes dejan constancia del balance final de la ejecución y de los saldos a favor o en contra.'],
  ['Habeas Data', 'el derecho que tiene todo titular de datos personales a conocer, actualizar, rectificar y suprimir la información que sobre él repose en bases de datos.'],
  ['Incidente de Seguridad', 'todo evento que comprometa la confidencialidad, integridad o disponibilidad de la información tratada con ocasión del Contrato.'],
  ['Propiedad Intelectual', 'los derechos de autor, derechos conexos, marcas, patentes, diseños industriales, secretos empresariales y demás derechos análogos.'],
];

/* -------------------------------------------------------- constructor */
function contexto(tipo, seed) {
  rnd = mulberry32(seed);
  const esPersonaB = tipo.docType === 'laboral' || tipo.key === 'cuota-litis';
  return {
    tipo,
    A: tipo.rolA, B: tipo.rolB,
    nombreA: pick(EMPRESAS),
    nitA: nit(),
    repA: pick(NOMBRES),
    nombreB: esPersonaB ? pick(NOMBRES) : pick(EMPRESAS),
    idB: esPersonaB ? cedula() : nit(),
    repB: pick(NOMBRES),
    ciudad: pick(CIUDADES),
    fechaSuscripcion: fecha(),
    valor: money(3000000, 480000000),
    plazoMeses: pick([6, 12, 18, 24, 36, 48]),
    numero: `${tipo.key.toUpperCase().slice(0, 6)}-${int(2023, 2026)}-${int(1000, 9999)}`,
    direccion: `${pick(['Calle','Carrera','Avenida','Transversal','Diagonal'])} ${int(1,180)} No. ${int(1,120)}-${int(1,99)}, ${pick(['Oficina','Apartamento','Local','Piso'])} ${int(101,1805)}`,
    matricula: `${int(50,600)}-${int(100000,999999)}`,
    penal: money(10000000, 200000000),
    seed,
  };
}

function encabezado(ctx) {
  const t = ctx.tipo;
  return `${t.titulo}
No. ${ctx.numero}

Ciudad de suscripción: ${ctx.ciudad}
Fecha de suscripción: ${ctx.fechaSuscripcion}
Valor total estimado: $${ctx.valor} M/CTE
Plazo de ejecución: ${ctx.plazoMeses} meses

ADVERTENCIA: documento sintético generado con fines exclusivos de prueba
del sistema RAG. Las partes, cifras, direcciones y hechos son ficticios.

================================================================================
COMPARECENCIA DE LAS PARTES
================================================================================

Entre los suscritos, a saber: ${ctx.repA}, mayor de edad, identificado(a) con
cédula de ciudadanía No. ${cedula()} expedida en ${pick(CIUDADES)}, obrando en
calidad de representante legal de ${ctx.nombreA}, sociedad comercial
identificada con NIT ${ctx.nitA}, domiciliada en ${ctx.ciudad}, debidamente
constituida y registrada en la Cámara de Comercio de ${ctx.ciudad}, quien para
efectos del presente documento se denominará ${ctx.A}; y de otra parte
${ctx.nombreB}, identificado(a) con ${ctx.idB.length > 10 ? 'NIT' : 'cédula de ciudadanía No.'} ${ctx.idB},
con domicilio en ${ctx.direccion} de la ciudad de ${pick(CIUDADES)}, quien en
adelante se denominará ${ctx.B}; hemos acordado celebrar el presente Contrato,
que se regirá por las siguientes consideraciones y cláusulas:

================================================================================
CONSIDERACIONES
================================================================================

PRIMERA. Que ${ctx.A} manifiesta contar con la capacidad legal, la
infraestructura y los recursos necesarios para la celebración y ejecución del
presente negocio jurídico.

SEGUNDA. Que ${ctx.B} declara conocer el alcance, las condiciones técnicas y
económicas, así como los riesgos propios del objeto contractual, y acepta
someterse a las obligaciones aquí descritas.

TERCERA. Que las Partes han adelantado las tratativas preliminares
correspondientes, dejando constancia de que ninguna declaración previa, verbal
o escrita, distinta de las contenidas en este documento y sus Anexos, produce
efectos vinculantes entre ellas.

CUARTA. Que el objeto del presente Contrato consiste en ${t.objeto}, conforme a
las especificaciones contenidas en los Anexos que hacen parte integral del
mismo.

QUINTA. Que las Partes declaran que los recursos empleados en la ejecución de
este Contrato provienen de actividades lícitas y que no se encuentran incluidas
en listas restrictivas nacionales o internacionales.

SEXTA. Que en virtud de lo anterior, las Partes acuerdan regirse por las
siguientes:

================================================================================
CLÁUSULAS
================================================================================
`;
}

function definiciones(ctx) {
  const extra = ctx.tipo.temas.slice(0, 8).map((t, i) => [
    `Obligación Específica ${i + 1}`,
    `la relativa a ${t}, en los términos desarrollados en el clausulado del presente Contrato.`,
  ]);
  const todas = shuffle([...DEFINICIONES_BASE, ...extra]).sort((a, b) => a[0].localeCompare(b[0], 'es'));
  let out = `CLÁUSULA PRIMERA. DEFINICIONES.\n\nPara todos los efectos de interpretación y ejecución del presente Contrato, los\ntérminos que se relacionan a continuación, escritos con inicial mayúscula,\ntendrán el significado que aquí se les asigna, con independencia de que se usen\nen singular o plural:\n\n`;
  todas.forEach(([term, def], i) => {
    out += `1.${i + 1}. ${term}: se entiende por tal ${def}\n\n`;
  });
  out += `1.${todas.length + 1}. Regla de interpretación. En caso de contradicción entre el cuerpo del\nContrato y sus Anexos, prevalecerá lo dispuesto en el cuerpo del Contrato,\nsalvo que el Anexo sea posterior y las Partes hayan manifestado expresamente su\nvoluntad de modificar la estipulación correspondiente.\n\n`;
  return out;
}

function clausula(ctx, num, titulo, temas, minNumerales = 4, maxNumerales = 9) {
  let out = `CLÁUSULA ${ordinal(num)}. ${titulo.toUpperCase()}.\n\n`;
  const n = int(minNumerales, maxNumerales);
  for (let i = 1; i <= n; i++) {
    const tema = pick(temas);
    const r = rnd();
    const p = r < 0.45 ? parrafoObligacion(ctx, tema)
            : r < 0.65 ? parrafoEconomico(ctx)
            : parrafoGeneral(ctx, tema);
    out += `${num}.${i}. ${p}\n\n`;
    if (rnd() < 0.35) {
      const sub = int(2, 4);
      for (let j = 1; j <= sub; j++) {
        out += `   ${num}.${i}.${j}. ${parrafoGeneral(ctx, pick(temas))}\n\n`;
      }
    }
  }
  return out;
}

const TITULOS_CLAUSULA = [
  'OBJETO DEL CONTRATO', 'ALCANCE DE LAS OBLIGACIONES', 'OBLIGACIONES ESPECIALES DE LA PARTE CONTRATANTE',
  'OBLIGACIONES ESPECIALES DE LA PARTE CONTRATISTA', 'VALOR Y FORMA DE PAGO', 'FACTURACIÓN Y REQUISITOS TRIBUTARIOS',
  'PLAZO Y VIGENCIA', 'PRÓRROGAS Y RENOVACIÓN', 'SUPERVISIÓN Y CONTROL DE LA EJECUCIÓN',
  'GARANTÍAS Y AMPAROS', 'CLÁUSULA PENAL PECUNIARIA', 'MULTAS Y APREMIOS',
  'CAUSALES DE TERMINACIÓN', 'TERMINACIÓN ANTICIPADA Y SUS EFECTOS', 'LIQUIDACIÓN DEL CONTRATO',
  'CESIÓN Y SUBCONTRATACIÓN', 'CONFIDENCIALIDAD DE LA INFORMACIÓN', 'PROTECCIÓN DE DATOS PERSONALES',
  'PROPIEDAD INTELECTUAL E INDUSTRIAL', 'INDEPENDENCIA DE LAS PARTES', 'RESPONSABILIDAD Y LÍMITES DE RESPONSABILIDAD',
  'INDEMNIDAD', 'SEGUROS Y PÓLIZAS', 'FUERZA MAYOR Y CASO FORTUITO',
  'MODIFICACIONES Y OTROSÍES', 'NOTIFICACIONES Y DOMICILIO CONTRACTUAL', 'SOLUCIÓN DE CONTROVERSIAS',
  'ARREGLO DIRECTO Y CONCILIACIÓN', 'CLÁUSULA COMPROMISORIA', 'LEY APLICABLE Y JURISDICCIÓN',
  'PREVENCIÓN DE LAVADO DE ACTIVOS Y FINANCIACIÓN DEL TERRORISMO', 'ANTICORRUPCIÓN Y TRANSPARENCIA',
  'CUMPLIMIENTO NORMATIVO Y SANCIONES', 'SEGURIDAD Y SALUD EN EL TRABAJO', 'GESTIÓN AMBIENTAL',
  'CONTINUIDAD DEL SERVICIO', 'CONTROL DE CAMBIOS', 'CRITERIOS DE ACEPTACIÓN Y RECIBO A SATISFACCIÓN',
  'NO RENUNCIA DE DERECHOS', 'DIVISIBILIDAD DE LAS ESTIPULACIONES', 'INTEGRIDAD DEL ACUERDO',
  'BUENA FE CONTRACTUAL', 'DEBER DE INFORMACIÓN RECÍPROCA', 'REGISTROS Y AUDITORÍA',
  'INVENTARIOS Y ACTAS DE ENTREGA', 'RÉGIMEN DE VISITAS E INSPECCIONES', 'MATRIZ DE RIESGOS Y SU ASIGNACIÓN',
  'REVISIÓN PERIÓDICA DE CONDICIONES', 'IMPUESTOS, TASAS Y CONTRIBUCIONES', 'GASTOS Y EXPENSAS',
  'ANEXOS E INTEGRACIÓN DOCUMENTAL', 'INTERPRETACIÓN Y PRELACIÓN NORMATIVA', 'DECLARACIONES Y GARANTÍAS DE LAS PARTES',
  'CONFLICTO DE INTERESES', 'NO COMPETENCIA Y NO SOLICITACIÓN', 'ARCHIVO Y CONSERVACIÓN DOCUMENTAL',
  'COMUNICACIONES ELECTRÓNICAS Y FIRMA DIGITAL', 'PERFECCIONAMIENTO Y EJECUCIÓN', 'SUSPENSIÓN TEMPORAL DE LA EJECUCIÓN',
  'REANUDACIÓN Y AJUSTE DE CRONOGRAMA', 'RÉGIMEN DE SUBSANACIÓN DE INCUMPLIMIENTOS', 'PLAN DE MEJORAMIENTO',
  'INDICADORES DE DESEMPEÑO', 'REPORTES PERIÓDICOS', 'REUNIONES DE SEGUIMIENTO',
  'COMITÉ OPERATIVO', 'ESCALAMIENTO DE INCIDENTES', 'CONTINGENCIA Y PLAN DE RECUPERACIÓN',
  'TRANSICIÓN Y REVERSIÓN', 'ENTREGA FINAL Y PAZ Y SALVO', 'EFECTOS DE LA NULIDAD PARCIAL',
];

function anexoTabla(ctx, titulo, idx) {
  let out = `ANEXO ${idx}. ${titulo}\n${'-'.repeat(78)}\n\n`;
  const filas = int(28, 55);
  out += `Ítem | Descripción                              | Cantidad | Valor unitario | Observación\n`;
  out += `${'-'.repeat(78)}\n`;
  const desc = ['Suministro de elementos', 'Servicio de mantenimiento preventivo', 'Licencia de uso anual', 'Honorarios por actuación procesal', 'Adecuación locativa', 'Dotación reglamentaria', 'Póliza de cumplimiento', 'Auditoría técnica', 'Capacitación al personal', 'Soporte técnico especializado', 'Transporte y logística', 'Insumos de operación', 'Mobiliario y enseres', 'Equipos de cómputo', 'Instalaciones eléctricas'];
  for (let i = 1; i <= filas; i++) {
    out += `${String(i).padStart(3)}  | ${(pick(desc) + ' ' + pick(['tipo A','tipo B','nivel 1','nivel 2','categoría especial','estándar'])).padEnd(40).slice(0,40)} | ${String(int(1, 250)).padStart(8)} | ${('$' + money(50000, 12000000)).padStart(14)} | ${pick(['Conforme','Sujeto a verificación','Reemplazable','Con garantía','Prorrateado'])}\n`;
  }
  out += `\nNotas del Anexo ${idx}:\n\n`;
  for (let i = 1; i <= int(6, 12); i++) {
    out += `(${i}) ${parrafoGeneral(ctx, pick(ctx.tipo.temas))}\n\n`;
  }
  return out;
}

function firmas(ctx) {
  return `
================================================================================
CONSTANCIA DE SUSCRIPCIÓN
================================================================================

Para constancia de lo anterior, las Partes suscriben el presente Contrato en dos
(2) ejemplares del mismo tenor y valor, en la ciudad de ${ctx.ciudad}, a los
${ctx.fechaSuscripcion}.


_______________________________        _______________________________
${ctx.repA.padEnd(38)}${ctx.repB}
${(ctx.A + ' — ' + ctx.nombreA).slice(0, 38).padEnd(38)}${(ctx.B + ' — ' + ctx.nombreB).slice(0, 38)}
NIT/C.C. ${ctx.nitA.padEnd(29)}NIT/C.C. ${ctx.idB}


Testigo 1: ${pick(NOMBRES)} — C.C. ${cedula()}
Testigo 2: ${pick(NOMBRES)} — C.C. ${cedula()}

FIN DEL DOCUMENTO — ${ctx.numero}
`;
}

const countWords = (s) => s.split(/\s+/).filter(Boolean).length;

function generarTexto(tipo, seed, factor = 1) {
  const ctx = contexto(tipo, seed);
  const objetivo = TARGET_WORDS * factor;
  let cuerpo = encabezado(ctx) + '\n' + definiciones(ctx);
  const titulos = [...TITULOS_CLAUSULA];
  let num = 2;
  const temas = [...tipo.temas];

  // Cláusulas específicas del tipo de contrato primero, luego las generales.
  while (countWords(cuerpo) < objetivo * 0.82) {
    const titulo = titulos.length ? titulos.shift() : `DISPOSICIONES COMPLEMENTARIAS (CONTINUACIÓN ${num})`;
    cuerpo += clausula(ctx, num, titulo, temas, 4, 9);
    num++;
  }

  // Anexos hasta completar el objetivo.
  let idx = 1;
  const anexos = [...tipo.anexos];
  while (countWords(cuerpo) < objetivo) {
    const t = anexos.length ? anexos.shift() : `RELACIÓN COMPLEMENTARIA DE ÍTEMS ${idx}`;
    cuerpo += '\n' + anexoTabla(ctx, t, idx);
    idx++;
  }

  cuerpo += firmas(ctx);
  return { ctx, texto: cuerpo, palabras: countWords(cuerpo), clausulas: num - 1, anexos: idx - 1 };
}

/* ------------------------------------------------------- render a PDF */
const PAGE = { size: 'LETTER', margins: { top: 62, bottom: 58, left: 64, right: 64 } };
const FUENTE = { cuerpo: 'Times-Roman', titulo: 'Times-Bold', mono: 'Courier' };

function clasificar(bloque) {
  const t = bloque.trim();
  if (/^={10,}$/m.test(t) && t.split('\n').every((l) => /^=+$/.test(l.trim()))) return 'regla';
  if (/^(CLÁUSULA|ANEXO)\s/i.test(t)) return 'titulo';
  if (/^(CONSIDERACIONES|CLÁUSULAS|COMPARECENCIA|CONSTANCIA)/i.test(t)) return 'titulo';
  if (t.includes('|') || /^-{20,}/.test(t) || /_{10,}/.test(t)) return 'mono';
  return 'parrafo';
}

function renderPdf(ctx, texto, file) {
  const doc = new PDFDocument({ ...PAGE, bufferPages: true, autoFirstPage: false });
  const stream = createWriteStream(file);
  doc.pipe(stream);

  Object.assign(doc.info, {
    Title: `${ctx.tipo.titulo} No. ${ctx.numero}`,
    Author: ctx.nombreA,
    Subject: `Documento sintético de prueba — ${ctx.tipo.docType}`,
    Keywords: `contrato, ${ctx.tipo.docType}, ${ctx.ciudad}, RAG, prueba`,
    Creator: 'generate-contracts.mjs',
  });

  // ---- portada
  doc.addPage();
  doc.font(FUENTE.titulo).fontSize(20).text(ctx.tipo.titulo, { align: 'center' });
  doc.moveDown(0.6);
  doc.font(FUENTE.cuerpo).fontSize(13).text(`No. ${ctx.numero}`, { align: 'center' });
  doc.moveDown(2.5);
  doc.fontSize(11);
  const filas = [
    ['Entre', `${ctx.nombreA} (${ctx.A})`],
    ['Y', `${ctx.nombreB} (${ctx.B})`],
    ['Ciudad', ctx.ciudad],
    ['Fecha de suscripción', ctx.fechaSuscripcion],
    ['Valor total estimado', `$${ctx.valor} M/CTE`],
    ['Plazo de ejecución', `${ctx.plazoMeses} meses`],
    ['Tipo documental', ctx.tipo.docType],
  ];
  for (const [k, v] of filas) {
    doc.font(FUENTE.titulo).text(`${k}: `, { continued: true });
    doc.font(FUENTE.cuerpo).text(v);
    doc.moveDown(0.35);
  }
  doc.moveDown(3);
  doc.fontSize(9).fillColor('#8a0000')
     .text('DOCUMENTO SINTÉTICO GENERADO PARA PRUEBAS DEL SISTEMA RAG. Las partes, cifras, direcciones y hechos son ficticios y no constituyen asesoría jurídica.',
           { align: 'center' });
  doc.fillColor('black');

  // ---- cuerpo
  doc.addPage();
  for (const bloque of texto.split(/\n\s*\n/)) {
    const t = bloque.replace(/\n=+\n?/g, '').trim();
    if (!t) continue;
    switch (clasificar(bloque)) {
      case 'regla':
        continue;
      case 'titulo':
        if (doc.y > doc.page.height - 150) doc.addPage();
        doc.moveDown(0.8);
        doc.font(FUENTE.titulo).fontSize(11.5)
           .text(t.replace(/\s+/g, ' '), { align: 'left' });
        doc.moveDown(0.4);
        break;
      case 'mono':
        doc.font(FUENTE.mono).fontSize(7.4)
           .text(t, { align: 'left', lineGap: 0.5 });
        doc.moveDown(0.5);
        break;
      default:
        doc.font(FUENTE.cuerpo).fontSize(10.5)
           .text(t.replace(/\s+/g, ' '), { align: 'justify', lineGap: 1.2 });
        doc.moveDown(0.45);
    }
  }

  // ---- pie de página con numeración real
  // Al escribir por debajo del margen inferior pdfkit añadiría páginas nuevas:
  // se anula el margen de cada página antes de pintar el pie.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    const bottom = doc.page.height - 42;
    doc.font(FUENTE.cuerpo).fontSize(8).fillColor('#555');
    doc.text(`${ctx.tipo.titulo} — No. ${ctx.numero}`, 64, bottom, {
      width: doc.page.width - 128,
      align: 'left',
      lineBreak: false,
    });
    doc.text(`Página ${i + 1} de ${range.count}`, 64, bottom, {
      width: doc.page.width - 128,
      align: 'right',
      lineBreak: false,
    });
    doc.fillColor('black');
  }

  const paginas = range.count;
  doc.flushPages();
  doc.end();
  return new Promise((res) => stream.on('finish', () => res(paginas)));
}

/**
 * Genera el PDF ajustando la cantidad de texto hasta acercarse a PAGES
 * páginas reales (la paginación la decide pdfkit, no el conteo de palabras).
 */
async function generarPdf(tipo, seed, outFile) {
  let factor = 1;
  let ultimo = null;
  for (let intento = 0; intento < 6; intento++) {
    const r = generarTexto(tipo, seed, factor);
    const paginas = await renderPdf(r.ctx, r.texto, outFile);
    ultimo = { ...r, paginas };
    const desvio = (paginas - PAGES) / PAGES;
    if (Math.abs(desvio) <= 0.02) break;       // ±2 páginas: suficiente
    factor = factor * (PAGES / paginas);       // corrige y reintenta
  }
  return ultimo;
}

/* --------------------------------------------------------------- main */
const WRITE_TXT = argv.includes('--txt');
mkdirSync(OUT_DIR, { recursive: true });
console.log(`Generando ${TIPOS.length} contratos PDF de ~${PAGES} páginas en ${OUT_DIR}\n`);

const manifest = [];
for (let i = 0; i < TIPOS.length; i++) {
  const tipo = TIPOS[i];
  const seed = 20260918 + i * 7919;
  const base = `${String(i + 1).padStart(2, '0')}-${tipo.key}`;
  const pdfPath = resolve(OUT_DIR, `${base}.pdf`);
  const r = await generarPdf(tipo, seed, pdfPath);
  if (WRITE_TXT) writeFileSync(resolve(OUT_DIR, `${base}.txt`), r.texto, 'utf8');

  manifest.push({
    file: `${base}.pdf`,
    title: `${tipo.titulo} No. ${r.ctx.numero}`,
    doc_type: tipo.docType,
    partes: { a: r.ctx.nombreA, b: r.ctx.nombreB },
    ciudad: r.ctx.ciudad,
    fecha: r.ctx.fechaSuscripcion,
    valor: `$${r.ctx.valor}`,
    plazo_meses: r.ctx.plazoMeses,
    paginas: r.paginas,
    palabras: r.palabras,
    clausulas: r.clausulas,
    anexos: r.anexos,
  });
  const kb = (statSync(pdfPath).size / 1024).toFixed(0);
  console.log(`  ✓ ${(base + '.pdf').padEnd(34)} ${String(r.paginas).padStart(3)} pág  ${String(r.palabras).padStart(6)} palabras  ${kb.padStart(5)} KB  ${r.clausulas} cláusulas`);
}

writeFileSync(resolve(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log(`\nmanifest.json escrito. Total: ${manifest.reduce((a, m) => a + m.paginas, 0)} páginas.`);
