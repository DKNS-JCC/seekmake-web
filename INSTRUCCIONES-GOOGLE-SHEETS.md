# 📊 Configuración de Google Sheets para el Sorteo

> **🔒 Sistema de Prevención de Duplicados:**  
> Este sorteo incluye **doble validación** para evitar participaciones repetidas:
> - **Validación por Cookie**: Impide que el mismo navegador participe dos veces
> - **Validación por IP**: Impide que la misma dirección IP participe múltiples veces
> 
> Ambos métodos trabajan en conjunto para garantizar un sorteo justo.

## Paso 1: Crear la Hoja de Cálculo

1. Ve a [Google Sheets](https://sheets.google.com)
2. Crea una nueva hoja de cálculo
3. Nómbrala: **"Sorteo Gala GJ - 3DCC"**
4. En la primera fila, añade estos encabezados:
   - A1: `Nombre`
   - B1: `Teléfono`
   - C1: `Fecha`
   - D1: `IP`

## Paso 2: Crear el Google Apps Script

1. En tu hoja de cálculo, ve a **Extensiones > Apps Script**
2. Borra el código que aparece por defecto
3. Copia y pega este código:

```javascript
// Función para recibir participaciones (POST)
function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data = JSON.parse(e.postData.contents);
    
    // Obtener la IP del usuario
    const userIP = e.parameter.userip || 'IP no disponible';
    
    // Verificar si la IP ya participó
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const ipColumn = sheet.getRange(2, 4, lastRow - 1, 1).getValues();
      const existingIPs = ipColumn.map(row => row[0]);
      
      if (existingIPs.includes(userIP)) {
        return ContentService
          .createTextOutput(JSON.stringify({ 
            'result': 'error', 
            'error': 'Esta IP ya ha participado en el sorteo' 
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    const timestamp = new Date(data.timestamp);
    const formattedDate = Utilities.formatDate(timestamp, 'Europe/Madrid', 'dd/MM/yyyy HH:mm:ss');
    
    sheet.appendRow([
      data.name,
      data.phone,
      formattedDate,
      userIP
    ]);
    
    return ContentService
      .createTextOutput(JSON.stringify({ 'result': 'success', 'row': sheet.getLastRow() }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ 'result': 'error', 'error': error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Función para obtener todos los participantes (GET)
function doGet(e) {
  try {
    const action = e.parameter.action;
    
    if (!action) {
      return ContentService.createTextOutput("API funcionando correctamente");
    }
    
    if (action === 'getParticipants') {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
      const lastRow = sheet.getLastRow();
      
      if (lastRow <= 1) {
        return ContentService
          .createTextOutput(JSON.stringify({ 
            'result': 'success', 
            'participants': [] 
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
      
      const participants = data.map(row => ({
        name: row[0],
        phone: row[1],
        timestamp: new Date(row[2]).toISOString(),
        ip: row[3]
      }));
      
      return ContentService
        .createTextOutput(JSON.stringify({ 
          'result': 'success', 
          'participants': participants 
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({ 'result': 'error', 'error': 'Acción no reconocida' }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ 'result': 'error', 'error': error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

4. Guarda el proyecto (Ctrl+S) con el nombre: **"Sorteo API"**

## Paso 3: Desplegar como Web App

1. Haz clic en **Implementar > Nueva implementación**
2. Selecciona tipo: **Aplicación web**
3. Configura:
   - **Descripción**: "API Sorteo Gala GJ"
   - **Ejecutar como**: "Yo (tu email)"
   - **Quién tiene acceso**: "Cualquier persona"
4. Haz clic en **Implementar**
5. Autoriza los permisos que te pida Google
6. **COPIA LA URL** que te da (algo como: `https://script.google.com/macros/s/AKfy...../exec`)

## Paso 4: Configurar los archivos HTML

### Para giveaway.html (Formulario de participación):

1. Abre el archivo `giveaway.html`
2. Busca esta línea (aproximadamente línea 314):
   ```javascript
   const GOOGLE_SCRIPT_URL = 'TU_URL_DE_GOOGLE_APPS_SCRIPT_AQUI';
   ```
3. Reemplázala con tu URL:
   ```javascript
   const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfy.../exec';
   ```
4. Busca la función `saveToGoogleSheets` (aproximadamente línea 324) y reemplázala con esta versión que incluye la obtención de IP:
   ```javascript
   // Función para obtener la IP del usuario
   async function getUserIP() {
       try {
           const response = await fetch('https://api.ipify.org?format=json');
           const data = await response.json();
           return data.ip;
       } catch (error) {
           console.error('Error obteniendo IP:', error);
           return 'IP no disponible';
       }
   }

   // Función para enviar datos a Google Sheets
   async function saveToGoogleSheets(participant) {
       try {
           // Obtener la IP del usuario
           const userIP = await getUserIP();
           
           // Añadir la IP como parámetro de URL
           const urlWithIP = `${GOOGLE_SCRIPT_URL}?userip=${encodeURIComponent(userIP)}`;
           
           const response = await fetch(urlWithIP, {
               method: 'POST',
               headers: {
                   'Content-Type': 'application/json',
               },
               body: JSON.stringify(participant)
           });
           
           const result = await response.json();
           
           // Verificar si hubo error (IP duplicada)
           if (result.result === 'error') {
               alert(result.error);
               return false;
           }
           
           return true;
       } catch (error) {
           console.error('Error enviando a Google Sheets:', error);
           return true; // Asumir éxito para evitar bloquear al usuario
       }
   }
   ```
5. Guarda el archivo

### Para giveaway-admin.html (Panel de administración):

1. Abre el archivo `giveaway-admin.html`
2. Busca esta línea (aproximadamente línea 166):
   ```javascript
   const GOOGLE_SCRIPT_URL = 'TU_URL_DE_GOOGLE_APPS_SCRIPT_AQUI';
   ```
3. Reemplázala con la **MISMA URL** que usaste en giveaway.html:
   ```javascript
   const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfy.../exec';
   ```
4. Busca la tabla de participantes (aproximadamente línea 145) y añade una columna para IP:
   ```html
   <th class="text-left py-3 px-4 text-gray-300 font-semibold">IP</th>
   ```
   Después de la columna "Fecha"
5. Guarda el archivo

## Paso 5: Probar

1. Sube los cambios a GitHub Pages
2. Abre `giveaway.html` en tu navegador
3. Completa el formulario de prueba
4. Verifica que aparezca en tu Google Sheet

## 🎲 Realizar el Sorteo

### Opción 1: Función Aleatoria en Sheets
1. En una celda vacía (por ejemplo E2), escribe:
   ```
   =INDEX(A:A,RANDBETWEEN(2,COUNTA(A:A)))
   ```
2. Presiona F9 para generar un nuevo ganador aleatorio

### Opción 2: Script de Sorteo
Añade esta función a tu Apps Script:

```javascript
function sortearGanador() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) {
    SpreadsheetApp.getUi().alert('No hay participantes');
    return;
  }
  
  // Generar número aleatorio (fila 2 en adelante)
  const winnerRow = Math.floor(Math.random() * (lastRow - 1)) + 2;
  
  // Obtener datos del ganador
  const winner = {
    nombre: sheet.getRange(winnerRow, 1).getValue(),
    email: sheet.getRange(winnerRow, 2).getValue(),
    telefono: sheet.getRange(winnerRow, 3).getValue(),
    fecha: sheet.getRange(winnerRow, 4).getValue()
  };
  
  // Mostrar ganador
  const mensaje = `🎉 GANADOR DEL SORTEO 🎉\n\n` +
                  `Nombre: ${winner.nombre}\n` +
                  `Email: ${winner.email}\n` +
                  `Teléfono: ${winner.telefono}\n` +
                  `Fecha: ${winner.fecha}\n\n` +
                  `Fila: ${winnerRow}`;
  
  SpreadsheetApp.getUi().alert(mensaje);
  
  // Resaltar la fila del ganador
  sheet.getRange(winnerRow, 1, 1, 4).setBackground('#90EE90');
}
```

Luego ve a **Extensiones > Macros > Importar** y añade `sortearGanador` como macro.

## 📊 Análisis de Datos

Tu hoja tendrá:
- **Tiempo real**: Los datos llegan automáticamente
- **Acceso desde cualquier lugar**: Puedes ver los participantes desde cualquier dispositivo
- **Exportación fácil**: Descarga como CSV, Excel, etc.
- **Gráficos**: Crea gráficos de participación por fecha/hora

## 🔧 Solución de Problemas

**No llegan datos:**
- Verifica que copiaste bien la URL
- Comprueba que desplegaste como "Cualquier persona" tiene acceso
- Mira la consola del navegador (F12) para errores

**Error de permisos:**
- Vuelve a autorizar en Apps Script
- Asegúrate de estar logueado en la misma cuenta de Google

**Participaciones duplicadas:**
- El sistema ahora previene participaciones desde la misma IP
- Adicionalmente, la cookie previene participaciones múltiples del mismo navegador
- Si necesitas permitir múltiples participaciones desde la misma red (ej: un evento), puedes comentar la validación de IP en el script

**Error al obtener IP:**
- Si el servicio de IP (ipify.org) no está disponible, el sistema registrará "IP no disponible"
- Esto no impedirá la participación, pero no podrá validar duplicados por IP

## 🎯 Ventajas de esta Solución

✅ Completamente gratuito
✅ Sin límite de participantes (hasta 5 millones de celdas)
✅ Accesible desde cualquier dispositivo
✅ Datos en tiempo real
✅ Backup automático de Google
✅ Fácil de exportar y analizar
✅ No requiere servidor ni base de datos

---

¿Dudas? Abre un issue o contacta con el desarrollador.
