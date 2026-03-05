from nicegui import ui
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURAZIONE ---
BACKEND_URL = os.getenv("API_URL", "http://127.0.0.1:3000") # Next.js gira nativamente sulla 3000
TITLE = "CONTENTHUNTER PIM | CLINICAL"
PORT = 3001

# --- LOGICA ---
class PIMApp:
    def __init__(self):
        self.active_page = 'products' # Master ERP di default
        self.data = []
        self.loading = False
        self.selected_product = None
        self.product_modal = None
        self.active_tab = 'base'

    async def navigate_to(self, page_name: str):
        self.active_page = page_name
        self.loading = True
        sidebar_area.refresh()
        content_area.refresh()
        
        endpoint_map = {
            'dashboard': '/api/repositories',
            'products': '/api/products',
            'brands': '/api/brands',
            'categories': '/api/categories',
            'catalogues': '/api/catalogues',
        }
        
        endpoint = endpoint_map.get(page_name)
        if endpoint:
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(f"{BACKEND_URL}{endpoint}", timeout=10)
                    if resp.status_code == 200:
                        raw_data = resp.json()
                        self.data = raw_data.get('products', raw_data) if isinstance(raw_data, dict) else raw_data
                    else: self.data = []
            except Exception: self.data = []
        
        self.loading = False
        content_area.refresh()

    async def open_product_detail(self, sku: str):
        if self.product_modal:
            self.product_modal.open()
            modal_content.refresh()
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"{BACKEND_URL}/api/products/{sku}", timeout=10)
                if resp.status_code == 200:
                    self.selected_product = resp.json()
        except: pass
        modal_content.refresh()

app_logic = PIMApp()

# --- DESIGN SYSTEM ---
def setup_styles():
    ui.colors(primary='#1A1A1A', secondary='#D4A373', accent='#718096')
    # Import Outfit Font & Material Symbols Outlined
    ui.add_head_html('<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">')
    ui.add_head_html('<link href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" rel="stylesheet">')
    
    ui.query('body').style('background-color: #FBFBFB; font-family: "Outfit", sans-serif;')
    
    ui.add_head_html('''
        <style>
            .q-drawer { background: #FFFFFF !important; border-right: 1px solid #F0F0F0 !important; width: 280px !important; }
            
            .sidebar-btn { 
                margin: 1px 12px !important; 
                border-radius: 12px !important; 
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
                color: #444444 !important; 
                font-weight: 600 !important;
                height: 44px !important;
                text-transform: none !important;
                font-size: 14px !important;
                letter-spacing: -0.01em;
            }
            .sidebar-btn .q-btn__content {
                justify-content: flex-start !important;
                flex-wrap: nowrap !important;
                gap: 12px;
                width: 100%;
            }
            .sidebar-btn:hover { background-color: #F8F9FA !important; color: #1A1A1A !important; }
            .sidebar-btn.active { 
                background-color: #1A1A1A !important; 
                color: #FFFFFF !important; 
                box-shadow: 0 4px 12px rgba(0,0,0,0.08);
            }
            .sidebar-btn.active .q-icon { color: #FFFFFF !important; }
            
            /* Group Labels (Giallo/Oro come richiesto) */
            .group-label { 
                font-size: 10px; font-weight: 800; color: #D4A373; 
                letter-spacing: 0.12em; padding: 22px 24px 6px 24px; 
                text-transform: uppercase; 
            }

            .profile-box { 
                background: #F9FAFB; border-radius: 18px; margin: 16px; padding: 14px;
                border: 1px solid #F0F0F0;
            }
            
            /* Table Styling */
            .clinical-table {
                background: white; border-radius: 20px; border: 1px solid #F0F0F0; overflow: hidden;
            }
            .table-row {
                padding: 14px 24px; border-bottom: 1px solid #F9F9F9; transition: all 0.2s;
            }
            .table-row:hover { background-color: #FBFBFB; cursor: pointer; }
            
            .status-badge {
                font-size: 10px; font-weight: 800; background: #F0FDF4; color: #166534;
                padding: 4px 10px; border-radius: 8px; text-transform: uppercase;
            }
        </style>
    ''')

# --- SIDEBAR ---
@ui.refreshable
def sidebar_area():
    with ui.column().classes('w-full gap-0 h-full'):
        # Logo Area
        with ui.column().classes('items-start w-full py-8 px-8'):
            with ui.row().classes('items-center gap-3'):
                with ui.element('div').classes('w-9 h-9 bg-[#1A1A1A] rounded-xl flex items-center justify-center shadow-md'):
                    ui.icon('o_auto_awesome', size='1.4rem', color='white')
                with ui.column().classes('gap-0'):
                    ui.label('CONTENT').classes('text-lg font-black tracking-tight text-[#1A1A1A] leading-none')
                    ui.label('HUNTER').classes('text-lg font-light tracking-tight text-slate-400 leading-none')

        # AREA CORE PIM
        ui.label('Core PIM').classes('group-label')
        sidebar_button('Master ERP', 'o_database', 'products')
        sidebar_button('Import Lab', 'o_file_download', 'import')
        sidebar_button('Catalogues', 'o_inventory_2', 'catalogues')
        
        # AREA DISTRIBUTION
        ui.label('Distribution').classes('group-label')
        sidebar_button('Excel Export', 'o_table_chart', 'export')
        sidebar_button('Omnichannel', 'o_public', 'channels')
        
        # AREA DATA MANAGEMENT
        ui.label('Data Management').classes('group-label')
        sidebar_button('Categories', 'o_layers', 'categories')
        sidebar_button('Brands', 'o_branding_watermark', 'brands')
        sidebar_button('Bullet Points', 'o_list', 'bullets')
        
        # AREA SYSTEM
        ui.label('System & AI').classes('group-label')
        sidebar_button('Settings', 'o_settings', 'settings')
        
        ui.space()
        
        # Bottom Profile
        with ui.column().classes('w-full mt-auto mb-4'):
            with ui.row().classes('profile-box items-center gap-3'):
                with ui.element('div').classes('w-9 h-9 bg-white rounded-full flex items-center justify-center text-[#1A1A1A] font-black border shadow-sm'):
                    ui.label('A')
                with ui.column().classes('gap-0'):
                    ui.label('Augusto Genca').classes('text-[13px] font-bold text-slate-800 leading-none')
                    ui.label('Administrator').classes('text-[9px] font-semibold text-slate-400 mt-1 uppercase tracking-wider')
            
            with ui.button(on_click=lambda: ui.notify('Logging out...')).classes('w-full justify-start py-4 px-8 text-slate-400 font-bold hover:text-red-500 transition-colors').props('flat no-caps'):
                with ui.row().classes('items-center gap-4'):
                    ui.icon('o_logout', size='20px')
                    ui.label('ESCI').classes('text-xs tracking-widest font-black')

def sidebar_button(label: str, icon: str, page_name: str):
    is_active = app_logic.active_page == page_name
    with ui.button(on_click=lambda: app_logic.navigate_to(page_name)).classes(f'sidebar-btn {"active" if is_active else ""} w-[calc(100%-24px)]').props('flat no-caps'):
        ui.icon(icon, size='22px').classes('material-icons-outlined')
        ui.label(label).classes('truncate text-left')

# --- CONTENT ---
@ui.refreshable
def content_area():
    if app_logic.loading:
        with ui.column().classes('w-full items-center justify-center p-40'):
            ui.spinner(size='xl', color='primary', thickness=2)
        return

    page = app_logic.active_page
    with ui.column().classes('w-full p-12 gap-8 max-w-[1440px] mx-auto'):
        
        with ui.row().classes('w-full justify-between items-center mb-4'):
            with ui.column().classes('gap-1'):
                ui.label('Industrial Data Control').classes('text-4xl font-extrabold text-[#1A1A1A] tracking-tighter')
                ui.label('Dashboard di monitoraggio asset e prestazioni sistema').classes('text-slate-400 text-sm font-medium')
            
            with ui.row().classes('gap-3'):
                ui.button('NUOVO ASSET', icon='o_add').classes('bg-[#1A1A1A] text-white px-6 py-2.5 rounded-xl font-bold shadow-lg text-xs').props('no-caps')

        # KPI Cards (New!)
        with ui.row().classes('w-full gap-6 mb-4'):
            kpi_card('ASSET RECUPERATI', '1,284', 'o_inventory_2', 'blue')
            kpi_card('STATO SISTEMA', 'ONLINE', 'o_cloud_done', 'green')
            kpi_card('AI ENGINE', 'READY', 'o_auto_awesome', 'purple')

        # Listado Clinical
        with ui.column().classes('clinical-table w-full shadow-sm'):
            with ui.row().classes('w-full px-8 py-4 bg-[#F9FAFB] border-b items-center'):
                ui.label('NOME PRODOTTO E SKU').classes('text-[10px] font-black text-slate-400 flex-[3] uppercase tracking-wider')
                ui.label('CODICE IDENTIFICATIVO').classes('text-[10px] font-black text-slate-400 flex-1 uppercase tracking-wider')
                ui.label('VALORE / STATO').classes('text-[10px] font-black text-slate-400 flex-1 text-center uppercase tracking-wider')

            if not app_logic.data:
                ui.label('NESSUN ASSET TROVATO NEL DATABASE.').classes('p-24 text-slate-300 italic text-center w-full font-bold text-xs uppercase tracking-widest')
            else:
                for item in app_logic.data:
                    with ui.row().classes('w-full table-row items-center').on('click', lambda item=item: app_logic.open_product_detail(item.get('sku')) if 'sku' in item else None):
                        # Info
                        with ui.row().classes('flex-[3] items-center gap-5'):
                            letter = (item.get('title') or item.get('name') or 'N')[0].upper()
                            with ui.element('div').classes('w-10 h-10 rounded-xl bg-[#F5F5F5] flex items-center justify-center text-[#1A1A1A] font-black border shadow-sm'):
                                ui.label(letter)
                            with ui.column().classes('gap-0'):
                                ui.label((item.get('title') or item.get('name', '---')).upper()).classes('text-[14px] font-bold text-slate-800 truncate max-w-lg')
                                ui.label(f"SKU: {item.get('sku', 'N/A')}").classes('text-[9px] font-bold text-slate-400 uppercase tracking-wider')
                        
                        ui.label(item.get('id', '---')).classes('flex-1 text-xs font-bold text-slate-500')
                        
                        with ui.row().classes('flex-1 justify-center'):
                            ui.label('SINCRONIZZATO').classes('status-badge')

def kpi_card(label: str, value: str, icon: str, color: str):
    with ui.card().classes('flex-1 p-6 rounded-3xl border border-slate-100 shadow-sm bg-white overflow-hidden relative'):
        with ui.row().classes('items-center gap-4'):
            with ui.element('div').classes(f'w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-900 border'):
                ui.icon(icon, size='24px').classes('material-icons-outlined')
            with ui.column().classes('gap-0'):
                ui.label(label).classes('text-[10px] font-black text-slate-400 uppercase tracking-widest')
                ui.label(value).classes('text-2xl font-black text-slate-900 tracking-tighter')

@ui.refreshable
def modal_content():
    p = app_logic.selected_product
    if not p: return
    with ui.column().classes('p-16 gap-8 w-full'):
        ui.label(p['sku']).classes('text-xs font-black text-blue-500 tracking-widest')
        ui.label(p['translations'].get('it', {}).get('title', 'Prodotto')).classes('text-3xl font-black tracking-tighter')
        ui.button('CHIUDI', on_click=app_logic.product_modal.close).classes('bg-slate-900 text-white rounded-xl px-12 py-4 font-black')

@ui.page('/')
def main_page():
    setup_styles()
    
    # Init data
    ui.timer(0.1, lambda: app_logic.navigate_to('products'), once=True)
    
    with ui.dialog().classes('w-full max-w-5xl') as product_modal:
        app_logic.product_modal = product_modal
        with ui.card().classes('p-0 w-full rounded-[2.5rem] bg-white border-0 shadow-2xl overflow-hidden'):
            modal_content()

    with ui.left_drawer(value=True, fixed=True).classes('p-0 shadow-none'):
        sidebar_area()
    with ui.column().classes('flex-1 w-full bg-[#FBFBFB] min-h-screen relative overflow-y-auto max-h-[100vh]'):
        content_area()

ui.run(title="CONTENTHUNTER PIM", host='0.0.0.0', port=PORT, show=False, reload=False)
