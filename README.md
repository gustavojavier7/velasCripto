# velasCripto

Aplicación simple para consultar precios y datos de mercado de Binance.

Abre `index.html` en un navegador para usarla.

## Cruce numérico

La versión 1.2.0 reemplaza el análisis Ramsey por un indicador de cruce entre el precio y un pronóstico lineal real.

- Lookback general: 480 velas.
- Regresión lineal móvil: 48 velas previas.
- Residuo: `g(t) = precio - pronóstico`.
- Secante: anticipa un posible cruce usando los dos residuos más recientes.
- IQI (interpolación inversa cuadrática): anticipa usando tres residuos.
- Regula Falsi: sólo se activa cuando las dos últimas observaciones ya encierran un cambio de signo.
- Dispersión Secante–IQI: mide cuánto difieren ambas estimaciones en unidades de velas.

El indicador separa explícitamente anticipación de confirmación y no interpreta los cruces como señales automáticas de compra o venta.
