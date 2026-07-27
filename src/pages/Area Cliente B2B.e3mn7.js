/**
 * B2B Panel - Código de Página Wix
 * VERSION: 1.0.6 - 2026-01-29 11:10
 * 
 * IMPORTANTE: El HtmlComponent debe tener ID: htmlB2BPanel
 */

const PAGE_VERSION = "1.0.6";

import wixLocation from 'wix-location';
import { cart } from 'wix-stores-frontend';

import { 
    checkB2BStatus, 
    getB2BProfile, 
    getB2BCoupon, 
    getUsualProducts,
    createB2BQuote
} from 'backend/b2b.web';

// Convierte URL de imagen Wix a URL pública
function convertWixImageUrl(wixUrl) {
    if (!wixUrl) return '';
    if (!wixUrl.startsWith('wix:image://')) return wixUrl;
    
    try {
        // Extraer el file ID de la URL wix:image://
        const match = wixUrl.match(/wix:image:\/\/v1\/([^\/]+)/);
        if (match && match[1]) {
            return `https://static.wixstatic.com/media/${match[1]}`;
        }
    } catch (e) {
        console.error('[B2B] Error convirtiendo URL imagen:', e);
    }
    return '';
}

$w.onReady(function () {
    console.log('[B2B Page v' + PAGE_VERSION + '] Iniciando...');
    console.log('[B2B Page v' + PAGE_VERSION + '] Registrando listener en htmlB2BPanel...');
    
    $w('#htmlB2BPanel').onMessage((event) => {
        const msg = event.data;
        console.log('[B2B Page v' + PAGE_VERSION + '] Mensaje RAW recibido:', event);
        
        if (!msg || typeof msg !== 'object') {
            console.log('[B2B Page v' + PAGE_VERSION + '] Mensaje ignorado (no es objeto)');
            return;
        }

        console.log('[B2B Page v' + PAGE_VERSION + '] Mensaje recibido:', msg.type);

        if (msg.type === 'ready') {
            loadAndSendData();
        }

        if (msg.type === 'addToCart') {
            handleAddToCartBulk(msg.items);
        }

        if (msg.type === 'requestQuote') {
            handleRequestQuote(msg.items, msg.couponCode);
        }

        if (msg.type === 'goHome') {
            wixLocation.to('/');
        }
    });
});

async function loadAndSendData() {
    console.log('[B2B Page] Cargando datos...');
    
    try {
        const status = await checkB2BStatus();
        console.log('[B2B Page] Status:', status);

        if (!status.isLoggedIn) {
            $w('#htmlB2BPanel').postMessage({
                type: 'init',
                payload: { isB2B: false, isLoggedIn: false, profile: null, coupon: null, products: [] }
            });
            return;
        }

        if (!status.isB2B) {
            $w('#htmlB2BPanel').postMessage({
                type: 'init',
                payload: { isB2B: false, isLoggedIn: true, profile: null, coupon: null, products: [] }
            });
            return;
        }

        const [profile, coupon, products] = await Promise.all([
            getB2BProfile(),
            getB2BCoupon(),
            getUsualProducts()
        ]);

        // Convertir URL del logo de formato Wix a URL pública
        if (profile && profile.companyLogo) {
            profile.companyLogo = convertWixImageUrl(profile.companyLogo);
        }

        // Convertir URLs de imágenes de productos
        if (products && products.length > 0) {
            products.forEach(product => {
                if (product.mainMedia) {
                    product.mainMedia = convertWixImageUrl(product.mainMedia);
                }
            });
        }

        console.log('[B2B Page] Datos cargados:', { profile, coupon, products: products?.length });

        $w('#htmlB2BPanel').postMessage({
            type: 'init',
            payload: { isB2B: true, isLoggedIn: true, profile, coupon, products }
        });

    } catch (error) {
        console.error('[B2B Page] Error:', error);
        $w('#htmlB2BPanel').postMessage({
            type: 'error',
            message: 'Error al cargar datos'
        });
    }
}

async function handleAddToCart(productIds, quantity = 1) {
    if (!productIds || !productIds.length) return;

    try {
        const items = productIds.map(id => ({ productId: id, quantity: quantity }));
        await cart.addProducts(items);

        const totalQty = items.length * quantity;
        $w('#htmlB2BPanel').postMessage({
            type: 'cartResult',
            success: true,
            message: `${totalQty} unidad(es) añadida(s)`
        });

    } catch (error) {
        console.error('[B2B Page] Error carrito:', error);
        $w('#htmlB2BPanel').postMessage({
            type: 'cartResult',
            success: false,
            message: 'Error al añadir productos'
        });
    }
}

async function handleAddToCartBulk(items) {
    if (!items || !items.length) return;

    try {
        const cartItems = items.map(item => ({ 
            productId: item.productId, 
            quantity: item.quantity || 1 
        }));
        await cart.addProducts(cartItems);

        const totalQty = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
        $w('#htmlB2BPanel').postMessage({
            type: 'cartResult',
            success: true,
            message: `${totalQty} unidades añadidas al carrito`
        });

    } catch (error) {
        console.error('[B2B Page] Error carrito bulk:', error);
        $w('#htmlB2BPanel').postMessage({
            type: 'cartResult',
            success: false,
            message: 'Error al añadir productos'
        });
    }
}

async function handleRequestQuote(items, couponCode) {
    if (!items || !items.length) {
        $w('#htmlB2BPanel').postMessage({
            type: 'quoteResult',
            success: false,
            message: 'No hay productos para cotizar'
        });
        return;
    }

    try {
        console.log('[B2B Page] Creando cotización con', items.length, 'productos');
        
        // El descuento se lee del campo discountPercent en B2BProfiles
        const result = await createB2BQuote(items, '');

        console.log('[B2B Page] Resultado cotización:', result);

        $w('#htmlB2BPanel').postMessage({
            type: 'quoteResult',
            success: result.success,
            message: result.success 
                ? `✅ Cotización enviada. Revisa tu email.`
                : (result.error || 'Error al crear cotización')
        });

    } catch (error) {
        console.error('[B2B Page] Error cotización:', error);
        $w('#htmlB2BPanel').postMessage({
            type: 'quoteResult',
            success: false,
            message: 'Error al procesar la cotización'
        });
    }
}