from nicegui import ui
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURAZIONE ---
BACKEND_URL = os.getenv("API_URL", "http://127.0.0.1:8000")
TITLE = "CONTENTHUNTER PIM | INDUSTRIAL"
PORT = 3001

# --- LOGICA ---
class PIMApp:
    def __init__(self):
        self.active_page = 'dashboard'
        self.data = []
        self.loading = False
        self.selected_product = None
        self.product_modal = None
        self.active_tab = 'base' # For modal tabs

    async def navigate_to(self, page_name: str):
        self.active_page = page_name
        self.loading = True
        sidebar_area.refresh()
        content_area.refresh()
        
        endpoint_map = {
            'dashboard': '/api/v5/repositories',
            'products': '/api/v5/products',
            'brands': '/api/v5/brands',
            'categories': '/api/v5/categories',
            'repos': '/api/v5/repositories',
        }
        
        endpoint = endpoint_map.get(page_name)
        if endpoint:
            url = f"{BACKEND_URL}{endpoint}"
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(url, timeout=15)
                    if resp.status_code == 200:
                        raw_data = resp.json()
                        if isinstance(raw_data, dict) and 'products' in raw_data:
                            self.data = raw_data['products']
                        elif isinstance(raw_data, list):
                            self.data = raw_data
                        else:
                            self.data = []
                    else:
                        ui.notify(f"Backend Errore {resp.status_code} su {url}", type='warning')
            except Exception as e:
                ui.notify(f"Errore connessione a {url}: {str(e)}", type='negative')
                self.data = []
        
        self.loading = False
        content_area.refresh()

    async def open_product_detail(self, sku: str):
        if self.product_modal:
            self.product_modal.open()
            modal_content.refresh()
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"{BACKEND_URL}/api/v5/products/{sku}", timeout=10)
                if resp.status_code == 200:
                    self.selected_product = resp.json()
        except: pass
        modal_content.refresh()

app_logic = PIMApp()

# --- DESIGN SYSTEM ---
def setup_styles():
    ui.colors(primary='#111827', secondary='#F3F4F6', accent='#6B7280')
    ui.query('body').style('background-color: #F8F9FA; font-family: "Inter", sans-serif;')
    ui.add_head_html('''
        <style>
            .q-drawer { background: #FFFFFF !important; border-right: 1px solid #E5E7EB !important; }
            
            /* Sidebar Item */
            .sidebar-btn { 
                margin: 4px 16px !important; 
                border-radius: 12px !important; 
                transition: all 0.2s; 
                color: #4A5568 !important; 
                font-weight: 700 !important;
                height: 52px !important;
                text-transform: none !important;
            }
            .sidebar-btn.active, .sidebar-btn.active .q-btn__content, .sidebar-btn.active .q-icon { 
                background-color: #111827 !important; 
                color: #FFFFFF !important; 
            }
            
            .group-label { 
                font-size: 11px; font-weight: 800; color: #94A3B8; 
                letter-spacing: 0.15em; padding: 30px 28px 12px 28px; 
            }

            .profile-card { 
                background: #F8FAFC; border-radius: 16px; margin: 0 16px 16px 16px; padding: 16px;
                border: 1px solid #F1F5F9;
            }
            
            /* Medical-Style List */
            .medical-table {
                background: white; border-radius: 16px; border: 1px solid #E2E8F0; overflow: hidden;
            }
            .table-header-cell {
                font-size: 10px; font-weight: 800; color: #ADB5BD; letter-spacing: 0.1em; text-transform: uppercase;
                padding: 20px 24px;
            }
            .table-row {
                padding: 18px 24px; border-bottom: 1px solid #F1F3F5; transition: all 0.2s;
            }
            .table-row:hover { background-color: #F8FAFC; cursor: pointer; }
            .row-avatar {
                width: 44px; height: 44px; border-radius: 14px; background: #E9ECEF;
                display: flex; items-center; justify-center; color: #D32F2F; font-weight: 900;
                border: 1px solid #DEE2E6;
            }
            .item-title { font-size: 14px; font-weight: 800; color: #212529; }
            .item-subtitle { font-size: 11px; font-weight: 700; color: #ADB5BD; text-transform: uppercase; }
            .col-bold { font-size: 13px; font-weight: 800; color: #495057; }
            .price-tag { color: #2D6A4F; font-size: 13px; font-weight: 900; }
            .status-tag { 
                background: #FFF0F0; color: #D32F2F; font-size: 9px; font-weight: 900; 
                padding: 2px 8px; border-radius: 6px; text-transform: uppercase;
            }
            .info-box { font-size: 12px; color: #868E96; font-weight: 600; }

            .kpi-card { 
                border-radius: 20px; background: white; border: 1px solid #F1F5F9; 
                padding: 30px; 
            }
            
            /* Modal / Tabs */
            .custom-tab { font-weight: 800; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; }
        </style>
    ''')

# --- SIDEBAR ---
@ui.refreshable
def sidebar_area():
    with ui.column().classes('w-full h-full'):
        with ui.column().classes('items-center w-full py-14 px-6'):
            with ui.element('div').classes('w-28 h-28 bg-[#111827] rounded-[2rem] flex items-center justify-center shadow-xl mb-6'):
                ui.icon('precision_manufacturing', size='3.5rem', color='white')
            ui.label('CONTENT HUNTER').classes('text-lg font-black tracking-[0.2em] text-[#111827]')

        ui.label('MENU PRINCIPALE').classes('group-label')
        sidebar_button('Dashboard', 'dashboard', 'dashboard')
        sidebar_button('Master ERP', 'inventory', 'products')
        sidebar_button('Import Lab', 'auto_awesome', 'import')
        sidebar_button('Cataloghi', 'folder', 'repos')
        
        ui.label('ANAGRAFICHE').classes('group-label')
        sidebar_button('Brand Library', 'branding_watermark', 'brands')
        sidebar_button('Categorie', 'account_tree', 'categories')
        
        ui.space()
        
        with ui.column().classes('w-full mt-auto'):
             with ui.row().classes('profile-card items-center gap-4'):
                with ui.element('div').classes('w-12 h-12 bg-white rounded-xl flex items-center justify-center text-[#111827] font-black border shadow-sm'):
                    ui.label('a').classes('text-xl')
                with ui.column().classes('gap-0'):
                    ui.label('Administrator').classes('text-sm font-black text-slate-800')
                    ui.label('SYSTEM ADMIN').classes('text-[9px] font-black text-slate-400')
            
             with ui.button(on_click=lambda: ui.notify('Logout')).classes('w-full justify-start py-6 px-10 text-slate-400 font-bold').props('flat no-caps'):
                with ui.row().classes('items-center gap-4'):
                    ui.icon('logout', size='22px')
                    ui.label('ESCI')

def sidebar_button(label: str, icon: str, page_name: str):
    is_active = app_logic.active_page == page_name
    with ui.button(on_click=lambda: app_logic.navigate_to(page_name)).classes(f'sidebar-btn {"active" if is_active else ""}').props('flat no-caps'):
        with ui.row().classes('items-center gap-4 w-full'):
            ui.icon(icon, size='24px')
            ui.label(label)

# --- CONTENT ---
@ui.refreshable
async def content_area():
    if app_logic.loading:
        with ui.column().classes('w-full items-center justify-center p-32'):
            ui.spinner(size='xl', color='primary')
        return

    page = app_logic.active_page
    with ui.column().classes('w-full p-12 gap-8 max-w-[1400px] mx-auto'):
        
        # Dashboard Header / KPIs
        if page == 'dashboard':
            with ui.column().classes('gap-1 mb-4'):
                ui.label('Industrial Data Control').classes('text-4xl font-black text-slate-900 tracking-tighter')
                ui.label('Dashboard di monitoraggio asset e prestazioni sistema').classes('text-slate-400 text-sm font-medium')
            
            with ui.row().classes('w-full gap-6'):
                kpi_box('ASSET RECUPERATI', str(len(app_logic.data)), 'inventory_2')
                kpi_box('STATO SISTEMA', 'SYNCHED' if app_logic.data else 'OFFLINE', 'cloud_done')
                kpi_box('AI ENGINE', 'CONNECTED', 'auto_awesome')

        # MEDICAL-STYLE LIST (The main list shared by Master ERP, Brands, Categories)
        with ui.column().classes('medical-table w-full shadow-sm'):
            # Table Header DYNAMICS
            with ui.row().classes('w-full bg-white border-b items-center'):
                if page == 'products' or page == 'dashboard':
                    ui.label('NOME PRODOTTO E SKU').classes('table-header-cell flex-[2.5]')
                    ui.label('CODICE IDENTIFICATIVO').classes('table-header-cell flex-1')
                    ui.label('VALORE / STATO').classes('table-header-cell flex-1 text-center')
                    ui.label('BRAND / CATEGORIA').classes('table-header-cell flex-1.5')
                elif page == 'brands':
                    ui.label('BRAND NAME').classes('table-header-cell flex-[2.5]')
                    ui.label('BRAND ID').classes('table-header-cell flex-1')
                    ui.label('PRODUCTS COUNT').classes('table-header-cell flex-1 text-center')
                    ui.label('LOGO STATUS').classes('table-header-cell flex-1.5')
                elif page == 'categories':
                    ui.label('CATEGORY NAME').classes('table-header-cell flex-[2.5]')
                    ui.label('CAT ID').classes('table-header-cell flex-1')
                    ui.label('PARENT CATEGORY').classes('table-header-cell flex-1 text-center')
                    ui.label('HIERARCHY').classes('table-header-cell flex-1.5')
                elif page == 'repos':
                    ui.label('REPOSITORY NAME').classes('table-header-cell flex-[2.5]')
                    ui.label('REPO ID').classes('table-header-cell flex-1')
                    ui.label('DOCS COUNT').classes('table-header-cell flex-1 text-center')
                    ui.label('SYNC STATUS').classes('table-header-cell flex-1.5')
                
                ui.label('AZIONI').classes('table-header-cell w-20 text-right')

            # Table Body
            if not app_logic.data:
                ui.label('NESSUN ASSET TROVATO NEL DATABASE.').classes('p-20 text-slate-300 italic text-center w-full font-black uppercase tracking-widest text-xs')
            else:
                for item in app_logic.data:
                    with ui.row().classes('w-full table-row items-center').on('click', lambda item=item: app_logic.open_product_detail(item.get('sku')) if page == 'products' else None):
                        
                        # Col 1: Avatar + Title/Sub
                        with ui.row().classes('flex-[2.5] items-center gap-4'):
                            with ui.element('div').classes('row-avatar'):
                                title = item.get('title') or item.get('name') or 'N'
                                ui.label(title[0].upper())
                            with ui.column().classes('gap-0'):
                                ui.label(title.upper()).classes('item-title truncate max-w-sm')
                                sub = f"SKU: {item.get('sku')}" if page == 'products' else f"ID: {item.get('id')}"
                                ui.label(sub).classes('item-subtitle')
                        
                        # Col 2: Identifiers
                        with ui.column().classes('flex-1 gap-0'):
                            if page == 'products':
                                ui.label(item.get('sku', 'N/A')).classes('col-bold')
                            else:
                                ui.label(f"#{item.get('id')}").classes('col-bold')
                        
                        # Col 3: Money/Status or Counts
                        with ui.column().classes('flex-1 items-center gap-1'):
                            if page == 'products':
                                ui.label(f"€ {item.get('price') or 0.0:.2f}").classes('price-tag')
                                with ui.element('span').classes('status-tag'): ui.label('VALIDATO')
                            else:
                                ui.label(str(item.get('product_count', 0))).classes('price-tag')
                                with ui.element('span').classes('status-tag'): ui.label('ATTIVO')
                        
                        # Col 4: Relations
                        with ui.column().classes('flex-1.5 gap-1'):
                            if page == 'products':
                                with ui.row().classes('items-center gap-2 info-box'):
                                    ui.icon('o_business', size='14px')
                                    ui.label(item.get('brand', 'NO BRAND'))
                                with ui.row().classes('items-center gap-2 info-box'):
                                    ui.icon('o_layers', size='14px')
                                    ui.label(item.get('category', 'UNCATEGORIZED'))
                            else:
                                with ui.row().classes('items-center gap-2 info-box'):
                                    ui.icon('o_info', size='14px')
                                    ui.label('SISTEMA')
                        
                        # Col 5: Chevron
                        ui.icon('chevron_right', color='slate-300').classes('w-20 text-right')

def kpi_box(label, value, icon):
    with ui.column().classes('kpi-card flex-1 shadow-sm'):
        with ui.element('div').classes('p-3 bg-slate-50 rounded-xl mb-3 inline-block'):
            ui.icon(icon, color='slate-900', size='20px')
        ui.label(label).classes('text-[10px] font-black text-slate-400 tracking-widest')
        ui.label(value).classes('text-2xl font-black text-slate-900 mt-1')

@ui.refreshable
def modal_content():
    p = app_logic.selected_product
    if not p: return
    with ui.column().classes('p-12 gap-8 w-full'):
        with ui.row().classes('w-full justify-between items-start'):
            with ui.column().classes('gap-1'):
                ui.label(p['sku']).classes('text-xs font-black text-blue-500 tracking-widest')
                ui.label(p['translations'].get('it', {}).get('title', 'Prodotto')).classes('text-4xl font-black tracking-tighter text-slate-900')
            ui.button(icon='close', on_click=app_logic.product_modal.close).props('flat round').classes('text-slate-300')
        
        # Professional Tabs
        with ui.row().classes('w-full border-b border-slate-100 mb-4'):
            modal_tab('BASE DATA', 'base')
            modal_tab('AI SEO CONTENT', 'seo')
            modal_tab('SPECIFICATIONS', 'extra')
        
        if app_logic.active_tab == 'base':
            with ui.grid(columns=2).classes('w-full gap-8'):
                with ui.column().classes('gap-4'):
                    ui.label('DESCRIZIONE COMMERCIALE (IT)').classes('text-[10px] font-black text-slate-400')
                    ui.textarea(value=p['translations'].get('it', {}).get('description', '')).classes('w-full').props('outlined rounded-2xl h-40')
                with ui.column().classes('gap-6'):
                    ui.label('DATI ANAGRAFICI').classes('text-[10px] font-black text-slate-400')
                    ui.input('Brand', value=p.get('brand')).classes('w-full').props('outlined rounded-xl')
                    ui.input('MSRP Price', value=str(p.get('price'))).classes('w-full').props('outlined rounded-xl prefix="€"')

        with ui.row().classes('w-full justify-end mt-6'):
            ui.button('CHIUDI SCHEDA', on_click=app_logic.product_modal.close).classes('text-slate-400 font-bold px-8 py-4').props('flat no-caps')
            ui.button('SALVA MODIFICHE', icon='save').classes('bg-slate-900 text-white px-12 py-4 rounded-xl font-black ml-4 shadow-xl').props('no-caps')

def modal_tab(label, tab_id):
    is_active = app_logic.active_tab == tab_id
    with ui.button(label, on_click=lambda: set_modal_tab(tab_id)).classes(f'custom-tab px-6 py-4 {"text-slate-900 border-b-2 border-slate-900" if is_active else "text-slate-300"}').props('flat no-caps'):
        pass

def set_modal_tab(tab_id):
    app_logic.active_tab = tab_id
    modal_content.refresh()

@ui.page('/')
async def main_page():
    setup_styles()
    with ui.dialog().classes('w-full max-w-6xl') as product_modal:
        app_logic.product_modal = product_modal
        with ui.card().classes('p-0 w-full rounded-[2rem] bg-white border-0 shadow-2xl overflow-hidden'):
            modal_content()

    with ui.left_drawer(value=True, fixed=True).classes('p-0 shadow-none border-r'):
        sidebar_area()
    with ui.column().classes('flex-1 w-full'):
        await content_area()
        if not app_logic.data:
            await app_logic.navigate_to('dashboard')

ui.run(title=TITLE, host='0.0.0.0', port=PORT, show=False, reload=False)
