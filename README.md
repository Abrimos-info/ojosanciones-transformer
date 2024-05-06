# Ojo con las Sanciones - Transformadora

Transformadora de datos para el proyecto [Ojo con las Sanciones](https://ojosanciones.sociedad.info/).

### Uso

```
node index.js -s [SOURCES]
```

El parámetro **-s** acepta un listado de strings que corresponden a archivos JSON con los datos fuente a transformar en formato JSON lines (un objeto por línea). La transformación a aplicar se determina automáticamente a partir del contenido de los archivos.

### Fuentes

Existen 3 fuentes posibles con sus respectivos datasets auxiliares:

- **funcion-publica**: se obtienen desde el [scraper oficial](https://gitlab.com/anticoding/ojosanciones-scraper) del proyecto.
- **sat-efos-definitivos**: se descarga desde el sitio del [SAT](http://omawww.sat.gob.mx/cifras_sat/Documents/Definitivos.csv) y se debe convertir a JSON lines. Opcionalmente, utiliza el dataset auxiliar **sat-efos-firmes** que también se descarga desde el sitio del [SAT](http://omawww.sat.gob.mx/cifras_sat/Documents/Firmes.csv), se convierte a JSON lines, y sirve de complemento de datos pero no como fuente de sanciones.
- **ofac-sdn**: se descarga desde la página de [OFAC](https://sanctionssearch.ofac.treas.gov/) en [este enlace](https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV). Se complementa con los datasets **ofac-add** ([descarga](https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/ADD.CSV)) con direcciones de las entidades sancionadas, **ofac-alt** ([descarga](https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/ALT.CSV)) con nombres alternativos de las entidades sancionadas, y **ofac-comments** ([descarga](https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN_COMMENTS.CSV)) con información adicional.

### Salida

El script produce un stream de objetos JSON, uno por línea, con todos los objetos de entidades sancionadas en el formato unificado utilizado por el [sitio web oficial](https://ojosanciones.sociedad.info/) del proyecto.
