#!/usr/bin/env node
const fs = require('fs');
const commandLineArgs = require('command-line-args');
const slug = require('slug');

const optionDefinitions = [
    { name: 'src', alias: 's', type: String, multiple: true, defaultOption: true }
];
const args = commandLineArgs(optionDefinitions);

let source = {};
let empresas = {};
let aux_firmes = {};
let nulls = [];
let mx = 0;
let ofac_remarks = {}
let ids = [];

if(args.src && args.src.length > 0) {
    args.src.map( file => {
        let rawdata = fs.readFileSync(file);
        let buffer = Buffer.from(rawdata);
        let string = buffer.toString();
        let lines = string.split('\n');
        let json = [];

        lines.map( l => {
            if(l.length > 0) json.push(JSON.parse(l.trim()))
        } );
        let type = detectSrcType(json[0]);
        source[type] = json;
    } )
}

// Procesar dataset Función Pública
if(source.hasOwnProperty('funcion-publica')) {
    source['funcion-publica'].map( obj => {
        transformFuncionPublica(obj)
    } )
}

// Dataset auxiliar firmes
if(source.hasOwnProperty('sat-efos-firmes')) {
    source['sat-efos-firmes'].map( obj => {
        transformSatEfosAux(obj);
    } );
}

// Procesar dataset SAT EFOS Definitivos
if(source.hasOwnProperty('sat-efos-definitivos')) {
    source['sat-efos-definitivos'].map( obj => {
        transformSatEfos(obj);
    } );
}

if(source.hasOwnProperty('ofac-sdn')) {
    let ofac_alt = generateOfacAuxMap('ofac-alt');
    let ofac_add = generateOfacAuxMap('ofac-add');
    let ofac_comments = generateOfacAuxMap('ofac-comments');

    source['ofac-sdn'].map( obj => {
        transformOfac(obj, ofac_alt, ofac_add, ofac_comments);
    } );
}

Object.keys(empresas).map( e => {
    process.stdout.write(JSON.stringify(empresas[e]));
    process.stdout.write('\n');
} );

// -----------------------------------------------------------------------------

function generateID(source, string) {
    let id = slug(string);
    if(ids.indexOf(id) < 0) ids.push(id);
    else {
        id = slug(source + ' ' + id);
    }

    return id;
}

function detectSrcType(obj) {
    if(obj.hasOwnProperty('numero_expediente')) return 'funcion-publica';
    if(obj.hasOwnProperty('Nombre del Contribuyente')) return 'sat-efos-definitivos';
    if(obj.hasOwnProperty('RAZÓN SOCIAL')) return 'sat-efos-firmes';
    if(obj.hasOwnProperty('SDN_name')) return 'ofac-sdn';
    if(obj.hasOwnProperty('add_num')) return 'ofac-add';
    if(obj.hasOwnProperty('alt_num')) return 'ofac-alt';
    if(obj.hasOwnProperty('comments')) return 'ofac-comments';
}

function transformFuncionPublica(obj) {
    if(obj.hasOwnProperty('rfc') && obj.rfc != null) {
        if(!empresas.hasOwnProperty(obj.rfc)) {
            empresas[obj.rfc] = {
                id: (obj.rfc)? obj.rfc : generateID('sfp', obj.nombre_razon_social.trim()),
                rfc: obj.rfc,
                nombre_razon_social: obj.nombre_razon_social.trim(),
                otros_nombres: [],
                sanciones: []
            }
        }
        if(obj.detalle.length > 0) {
            obj.detalle.map( d => {
                let sancion = {
                    fuente: 'sfp',
                    fecha_sancion: (d.fecha_dof)? new Date(d.fecha_dof) : null,
                    numero_expediente: d.numero_expediente,
                    fecha_notificacion: new Date(d.fecha_notificacion),
                    fecha_dof: (d.fecha_dof)? new Date(d.fecha_dof) : null,
                    monto_multa: parseFloat(d.multa.monto),
                    periodo_inhabilitacion: d.plazo.plazo_inha,
                    fecha_inicio: (d.plazo.fecha_inicial)? new Date(d.plazo.fecha_inicial) : null,
                    fecha_fin: (d.plazo.fecha_final)? new Date(d.plazo.fecha_final) : null,
                    observaciones: d.observaciones,
                    objeto_social: d.objeto_social,
                    leyes_infringidas: d.leyes_infringidas,
                    causa: d.causa_motivo_hechos,
                    oic_responsable: d.oic_responsable,
                    responsable: {
                        nombre: d.responsable.nombres_resp + ((d.responsable.primer_apellido_resp)? ' ' + d.responsable.primer_apellido_resp : '') + ((d.responsable.segundo_apellido_resp)? ' ' + d.responsable.segundo_apellido_resp : ''),
                        cargo: d.responsable.cargo_resp,
                        telefono: d.responsable.telefono_resp,
                        email: d.responsable.email_resp
                    },
                    institucion_dependencia: (d.institucion_dependencia.nombre)? d.institucion_dependencia.nombre : d.autoridad_sancionadora,
                    telefono: d.telefono
                }
                empresas[obj.rfc].sanciones.push(sancion);
            } );
        }
    }
    else {
        nulls.push(obj);
    }
}

function transformSatEfosAux(obj) {
    if(!aux_firmes.hasOwnProperty(obj['RFC'])) {
        aux_firmes[obj['RFC']] = {
            rfc: obj['RFC'],
            nombre_razon_social: obj['RAZÓN SOCIAL'],
            tipo_persona: obj['TIPO PERSONA'],
            fecha_primera_publicacion: obj['FECHAS DE PRIMERA PUBLICACION'],
            entidad_federativa: obj['ENTIDAD FEDERATIVA']
        }
    }
}

function transformSatEfos(obj) {
    if(obj.hasOwnProperty('RFC') && obj['RFC'] != null) {
        if(!empresas.hasOwnProperty(obj['RFC'])) {
            empresas[obj['RFC']] = {
                id: (obj['RFC'])? obj['RFC'] : generateID('sat-efos', obj['Nombre del Contribuyente'].trim().replace(/"/g, '')),
                rfc: obj['RFC'],
                nombre_razon_social: obj['Nombre del Contribuyente'].trim().replace(/"/g, ''),
                otros_nombres: [],
                sanciones: []
            }
        }
        else {
            if(empresas[obj['RFC']].nombre_razon_social != obj['Nombre del Contribuyente']) {
                empresas[obj['RFC']].otros_nombres.push(obj['Nombre del Contribuyente'])
            }
        }

        let sancion = {
            fuente: 'sat-efos',
            fecha_sancion: convertDate(obj['Publicación DOF definitivos']),
            numero_oficio_presuncion_sat: parseNumOficio(obj['Número y fecha de oficio global de presunción SAT']),
            fecha_oficio_presuncion_sat: parseFechaOficio(obj['Número y fecha de oficio global de presunción SAT']),
            fecha_publicacion_sat_presuntos: convertDate(obj['Publicación página SAT presuntos']),
            numero_oficio_presuncion_dof: parseNumOficio(obj['Número y fecha de oficio global de presunción DOF']),
            fecha_oficio_presuncion_dof: parseFechaOficio(obj['Número y fecha de oficio global de presunción DOF']),
            fecha_publicacion_dof_presuntos: convertDate(obj['Publicación DOF presuntos']),
            numero_oficio_desvirtuados_sat: parseNumOficio(obj['Número y fecha de oficio global de contribuyentes que desvirtuaron SAT']),
            fecha_oficio_desvirtuados_sat: parseFechaOficio(obj['Número y fecha de oficio global de contribuyentes que desvirtuaron SAT']),
            fecha_publicacion_sat_desvirtuados: convertDate(obj['Publicación página SAT desvirtuados']),
            numero_oficio_desvirtuados_dof: parseNumOficio(obj['Número y fecha de oficio global de contribuyentes que desvirtuaron DOF']),
            fecha_oficio_desvirtuados_dof: parseFechaOficio(obj['Número y fecha de oficio global de contribuyentes que desvirtuaron DOF']),
            fecha_publicacion_dof_desvirtuados: convertDate(obj['Publicación DOF desvirtuados']),
            numero_oficio_definitivos_sat: parseNumOficio(obj['Número y fecha de oficio global de definitivos SAT']),
            fecha_oficio_definitivos_sat: parseFechaOficio(obj['Número y fecha de oficio global de definitivos SAT']),
            fecha_publicacion_sat_definitivos: convertDate(obj['Publicación página SAT definitivos']),
            numero_oficio_definitivos_dof: parseNumOficio(obj['Número y fecha de oficio global de definitivos DOF']),
            fecha_oficio_definitivos_dof: parseFechaOficio(obj['Número y fecha de oficio global de definitivos DOF']),
            fecha_publicacion_dof_definitivos: convertDate(obj['Publicación DOF definitivos']),
            numero_oficio_sentencia_favorable_sat: parseNumOficio(obj['Número y fecha de oficio global de sentencia favorable SAT']),
            fecha_oficio_sentencia_favorable_sat: parseFechaOficio(obj['Número y fecha de oficio global de sentencia favorable SAT']),
            fecha_publicacion_sat_sentencia_favorable: convertDate(obj['Publicación página SAT sentencia favorable']),
            numero_oficio_sentencia_favorable_dof: parseNumOficio(obj['Número y fecha de oficio global de sentencia favorable DOF']),
            fecha_oficio_sentencia_favorable_dof: parseFechaOficio(obj['Número y fecha de oficio global de sentencia favorable DOF']),
            fecha_publicacion_dof_sentencia_favorable: convertDate(obj['Publicación DOF sentencia favorable'])
        }
        empresas[obj['RFC']].sanciones.push(sancion);

        if(aux_firmes.hasOwnProperty(obj['RFC'])) {
            if(aux_firmes[obj['RFC']].hasOwnProperty('entidad_federativa')) empresas[obj['RFC']].entidad_federativa = aux_firmes[obj['RFC']].entidad_federativa
        }
    }
    else {
        nulls.push(obj);
    }
}

function transformOfac(obj, ofac_alt, ofac_add, ofac_comments) {
    if(!obj.hasOwnProperty('SDN_name')) return;
    let id = obj.ent_num;
    let alt = (ofac_alt.hasOwnProperty('item-' + id))? ofac_alt['item-' + id] : null;
    let add = (ofac_add.hasOwnProperty('item-' + id))? ofac_add['item-' + id] : null;
    let comments = (ofac_comments.hasOwnProperty('item-' + id))? ofac_comments['item-' + id] : null;

    let nombre = obj['SDN_name'];
    if(obj['SDN_type'] != '-0-') nombre = switchOfacName(obj['SDN_name']);

    let ofacObj = {
        id: generateID('ofac', nombre),
        nombre_razon_social: nombre,
        otros_nombres: [],
        direcciones: [],
        sanciones: []
    }

    if(obj['Remarks'] != '-0-') {
        extractFromRemarks(obj['Remarks'], ofacObj);
    }

    if(alt && alt.length > 0) {
        let alts = ofacObj.otros_nombres;
        alt.map( a => {
            let other_name = a.alt_name;
            if(obj['SDN_type'] != '-0-') other_name = switchOfacName(a.alt_name);
            alts.push(other_name);
        } );
        ofacObj.otros_nombres = [...new Set(alts)];
    }
    if(add && add.length > 0) {
        let adds = ofacObj.direcciones;
        add.map( a => {
            let direccion = ((a['Address'] != '-0-')? a['Address'] + ', ' : '')
                            + ((a['CityStateProvincePostalCode'] != '-0-')? a['CityStateProvincePostalCode'] + ', ' : '')
                            + a['Country'];
            if(direccion != a['Country']) adds.push(direccion);
        } );
        if(adds.length > 0)
            ofacObj.direcciones = [...new Set(adds)];
    }

    let sancion = {
        fuente: 'ofac',
        fecha_sancion: new Date(),
        programa: getProgram(obj['Program'])
    }

    ofacObj.sanciones.push(sancion);

    if(JSON.stringify(ofacObj).match(/Mexico/))
        empresas['OFAC-' + id] = ofacObj;
}

function extractFromRemarks(remarks, obj) {
    let list = remarks.split(/;\s?/);
    let extra = [];
    list.map( l => {
        let key = l.split(' ')[0];
        switch(key) {
            case 'R.F.C.':
            case 'RFC':
                obj.rfc = l.split(' ')[1].trim().replace(/\-/g, '');
                break;
            case 'POB':
                obj.lugar_nacimiento = l.replace('POB ', '');
                if(obj.lugar_nacimiento.match(/\./)) obj.lugar_nacimiento = obj.lugar_nacimiento.replace(/\./g, '');
                break;
            case 'DOB':
                obj.fecha_nacimiento = parseOfacDate(l.replace('DOB ', ''));
                break;
            case 'citizen':
            case 'nationality':
                // TODO: translate country name
                break;
            case 'Gender':
                obj.genero = (l.match(/Female/))? 'F' : 'M';
                break;
            case 'a.k.a.':
                obj.otros_nombres.push(l.replace('a.k.a. ', ''));
                break;
            case 'Website':
                obj.url = l.replace('Website ', '');
                break;
            case 'Organization':
                if(l.match(/Type/)) obj.tipo_organizacion = l.replace('Organization Type: ', '');
                else if(l.match(/Established/)) obj.fecha_establecimiento = parseOfacDate(l.replace('Organization Established Date ', ''));
                break;

            case 'alt.':
            case 'Business':
            case 'Cartilla':
            case 'Cedula':
            case 'Credencial':
            case 'C.U.I.P.':
            case 'C.U.R.P.':
            case 'd.b.a.':
            case 'Digital':
            case "Driver's":
            case 'Electoral':
            case 'Folio':
            case 'Identification':
            case 'I.F.E.':
            case 'Immigration':
            case 'Linked':
            case 'Matricula':
            case 'National':
            case 'NIT':
            case 'Passport':
            case 'Phone':
            case 'Registration':
            case 'Residency':
            case 'SRE':
            case 'SSN':
            case 'Tax':
            case 'VisaNumberID':
            default:
                extra.push(l);
                break;
        }
    } );
}

function switchOfacName(string) {
    let names = string.split(',');
    if(names.length == 2) return names[1].trim().toUpperCase() + ' ' + names[0].trim().toUpperCase();
    else {
        let first = [];
        let last = [];
        names.map( name => {
            if(name.match(/[a-z]/)) first.push(name.trim());
            else last.push(name.trim());
        } )
        return first.join(' ').toUpperCase() + ' ' + last.join(' ').toUpperCase();
    }
}

function getProgram(program) {
    switch(program) {
        case 'ILLICIT-DRUGS-EO14059':
            return 'Executive Order 14059';
        case 'SDNTK] [ILLICIT-DRUGS-EO14059':
            return 'Executive Order 14059';
        case 'SDNTK':
            return 'Foreign Narcotics Kingpin Sanctions Regulations, 31 C.F.R. part 598';
        case 'SDNT':
            return 'Narcotics Trafficking Sanctions Regulations, 31 C.F.R. part 536';
        case 'SDGT':
            return 'Global Terrorism Sanctions Regulations, 31 C.F.R. part 594';
        case 'GLOMAG':
            return 'Executive Order 13818 -  Global Magnitsky';
        case 'VENEZUELA-EO13850':
            return 'Executive Order 13850';
        case 'TCO':
            return 'Transnational Criminal Organizations Sanctions Regulations, 31 C.F.R. part 590; Executive Order 13581';

        default: return program;
    }
}

function parseNumOficio(string) {
    if(!string) return null;
    return string.split(' ')[0];
}

function parseFechaOficio(string) {
    if(!string) return null;
    let fechaStr = string.split(/\s/).slice(1).filter( x => x.length > 0 && x != 'de' && x != 'fecha' );
    let fecha = fechaStr[2] + '-' + getMonthNum(fechaStr[1]) + '-' + fechaStr[0].padStart(2, '0');
    return new Date(fecha);
}

function parseOfacDate(string) {
    if(!string) return null;
    let fecha = string.split(' ');
    return new Date( fecha[2] + '-' + getMonthNum(fecha[1]) + '-' + fecha[0].padStart(2, '0') );
}

function getMonthNum(string) {
    switch(string) {
        case 'Jan':
        case 'enero': return '01';
        case 'Feb':
        case 'febrero': return '02';
        case 'Mar':
        case 'marzo': return '03';
        case 'Apr':
        case 'abril': return '04';
        case 'May':
        case 'mayo': return '05';
        case 'Jun':
        case 'junio': return '06';
        case 'Jul':
        case 'julio': return '07';
        case 'Aug':
        case 'agosto': return '08';
        case 'Sep':
        case 'septiembre': return '09';
        case 'Oct':
        case 'octubre': return '10';
        case 'Nov':
        case 'noviembre': return '11';
        case 'Dec':
        case 'diciembre': return '12';
    }
}

function convertDate(string) {
    if(!string) return null;
    if(string.length <= 5) return null;
    let parts = string.split('/');
    return new Date(parts[2] + '-' + parts[1] + '-' + parts[0]);
}

function generateOfacAuxMap(key) {
    let map = [];
    if(source.hasOwnProperty(key)) {
        source[key].map( alt => {
            if(!map.hasOwnProperty('item-' + alt.ent_num)) {
                map['item-' + alt.ent_num] = [ alt ];
            }
            else map['item-' + alt.ent_num].push(alt);
        } );
    }
    return map;
}
