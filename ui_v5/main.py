from nicegui import ui
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURAZIONE ---
BACKEND_URL = os.getenv("API_URL", "http://127.0.0.1:8000")
TITLE = "CONTENTHUNTER PIM | CLINICAL"
PORT = 3001

# --- LOGICA ---
class PIMApp:
    def __init__(self):
        self.active_page = 'dashboard'
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
            'dashboard': '/api/v5/repositories',
            'products': '/api/v5/products',
            'brands': '/api/v5/brands',
            'categories': '/api/v5/categories',
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
                resp = await client.get(f"{BACKEND_URL}/api/v5/products/{sku}", timeout=10)
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
            .q-drawer { background: #FFFFFF !important; border-right: 1px solid #F0F0F0 !important; }
            
            /* Sidebar Button (Replica dello screenshot) */
            .sidebar-btn { 
                margin: 1px 16px !important; 
                border-radius: 14px !important; 
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
                color: #333333 !important; 
                font-weight: 500 !important;
                height: 50px !important;
                text-transform: none !important;
                font-size: 15px !important;
                letter-spacing: -0.01em;
            }
            .sidebar-btn:hover { background-color: #F5F5F5 !important; }
            .sidebar-btn.active { 
                background-color: #1A1A1A !important; 
                color: #FFFFFF !important; 
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            .sidebar-btn.active .q-icon { color: #FFFFFF !important; }
            
            /* Group Labels (Giallo/Oro come richiesto) */
            .group-label { 
                font-size: 11px; font-weight: 800; color: #D4A373; 
                letter-spacing: 0.08em; padding: 28px 28px 10px 28px; 
                text-transform: uppercase; 
            }

            .profile-box { 
                background: #F9FAFB; border-radius: 20px; margin: 20px; padding: 18px;
                border: 1px solid #F0F0F0;
            }
            
            /* Table Styling */
            .clinical-table {
                background: white; border-radius: 24px; border: 1px solid #F0F0F0; overflow: hidden;
            }
            .table-row {
                padding: 16px 28px; border-bottom: 1px solid #F9F9F9; transition: all 0.2s;
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
        with ui.column().classes('items-start w-full py-10 px-8'):
            with ui.row().classes('items-center gap-3'):
                with ui.element('div').classes('w-10 h-10 bg-[#1A1A1A] rounded-xl flex items-center justify-center'):
                    ui.icon('o_bubble_chart', size='1.8rem', color='white')
                ui.label('CONTENT').classes('text-xl font-black tracking-tight text-[#1A1A1A]')
                ui.label('HUNTER').classes('text-xl font-light tracking-tight text-slate-400 -ml-2')

        ui.label('MENU PRINCIPALE').classes('group-label')
        sidebar_button('Calendario Corsi', 'o_calendar_today', 'dashboard')
        sidebar_button('Master ERP', 'o_inventory_2', 'products')
        sidebar_button('Laboratorio AI', 'o_temp_night', 'import') # Icona più sottile
        sidebar_button('Cataloghi PDF', 'o_folder_open', 'repos')
        
        ui.label('SEGRETERIA').classes('group-label')
        sidebar_button('Staff / Docenti', 'o_badge', 'brands')
        sidebar_button('Controllo Accessi', 'o_lock_open', 'categories')
        
        ui.space()
        
        # Bottom Profile Exactly from hybrid design
        with ui.column().classes('w-full mt-auto mb-6'):
            with ui.row().classes('profile-box items-center gap-4'):
                with ui.element('div').classes('w-10 h-10 bg-white rounded-xl flex items-center justify-center text-[#1A1A1A] font-black border shadow-sm'):
                    ui.label('A')
                with ui.column().classes('gap-0'):
                    ui.label('Administrator').classes('text-[14px] font-bold text-slate-800')
                    ui.label('V. 7.5').classes('text-[10px] font-semibold text-slate-400')
            
            with ui.button(on_click=lambda: ui.notify('Closing session...')).classes('w-full justify-start py-6 px-10 text-slate-400 font-bold hover:text-black transition-colors').props('flat no-caps'):
                with ui.row().classes('items-center gap-4'):
                    ui.icon('o_power_settings_new', size='22px')
                    ui.label('ESCI')

def sidebar_button(label: str, icon: str, page_name: str):
    is_active = app_logic.active_page == page_name
    # Usando Material Icons Outlined
    with ui.button(on_click=lambda: app_logic.navigate_to(page_name)).classes(f'sidebar-btn {"active" if is_active else ""}').props('flat no-caps'):
        with ui.row().classes('items-center gap-5 w-full'):
            ui.icon(icon, size='24px').classes('material-icons-outlined')
            ui.label(label)

# --- CONTENT ---
@ui.refreshable
async def content_area():
    if app_logic.loading:
        with ui.column().classes('w-full items-center justify-center p-40'):
            ui.spinner(size='xl', color='primary', thickness=2)
        return

    page = app_logic.active_page
    with ui.column().classes('w-full p-16 gap-10 max-w-[1400px] mx-auto'):
        
        with ui.row().classes('w-full justify-between items-end'):
            with ui.column().classes('gap-1'):
                ui.label('Industrial Data Hub').classes('text-5xl font-extrabold text-[#1A1A1A] tracking-tighter')
                ui.label('Monitoraggio asset e controllo integrità database').classes('text-slate-400 text-lg font-medium')
            
            with ui.row().classes('gap-4'):
                ui.button('NUOVO ASSET', icon='o_add').classes('bg-[#1A1A1A] text-white px-8 py-3 rounded-2xl font-bold shadow-lg').props('no-caps')

        # Listado Clinical
        with ui.column().classes('clinical-table w-full shadow-sm'):
            with ui.row().classes('w-full px-8 py-5 bg-[#F9F9F9] border-b items-center'):
                ui.label('DESCRIZIONE PRODOTTO').classes('text-[11px] font-black text-slate-400 flex-[3]')
                ui.label('SKU / ID').classes('text-[11px] font-black text-slate-400 flex-1')
                ui.label('QUOTAZIONE').classes('text-[11px] font-black text-slate-400 flex-1 text-center')
                ui.label('STATO').classes('text-[11px] font-black text-slate-400 flex-1 text-center')

            if not app_logic.data:
                ui.label('Ricerca in corso o nessun dato trovato...').classes('p-24 text-slate-300 italic text-center w-full font-bold text-sm')
            else:
                for item in app_logic.data:
                    with ui.row().classes('w-full table-row items-center').on('click', lambda item=item: app_logic.open_product_detail(item.get('sku')) if 'sku' in item else None):
                        # Info
                        with ui.row().classes('flex-[3] items-center gap-6'):
                            letter = (item.get('title') or item.get('name') or 'N')[0].upper()
                            with ui.element('div').classes('w-12 h-12 rounded-2xl bg-[#F5F5F5] flex items-center justify-center text-[#1A1A1A] font-black border'):
                                ui.label(letter)
                            with ui.column().classes('gap-0'):
                                ui.label((item.get('title') or item.get('name', '---')).upper()).classes('text-[15px] font-bold text-slate-900 truncate max-w-lg')
                                ui.label(f"SYSTEM ID: {item.get('id')}").classes('text-[10px] font-bold text-slate-400 uppercase tracking-tighter')
                        
                        ui.label(item.get('sku', 'N/A')).classes('flex-1 text-sm font-bold text-slate-500')
                        ui.label(f"€ {item.get('price', 0.0):.2f}" if 'price' in item else "---").classes('flex-1 text-center text-sm font-black text-slate-800')
                        
                        with ui.row().classes('flex-1 justify-center'):
                            ui.label('VERIFICATO').classes('status-badge')

@ui.refreshable
def modal_content():
    p = app_logic.selected_product
    if not p: return
    with ui.column().classes('p-16 gap-8 w-full'):
        ui.label(p['sku']).classes('text-xs font-black text-blue-500 tracking-widest')
        ui.label(p['translations'].get('it', {}).get('title', 'Prodotto')).classes('text-3xl font-black tracking-tighter')
        ui.button('CHIUDI', on_click=app_logic.product_modal.close).classes('bg-slate-900 text-white rounded-xl px-12 py-4 font-black')

@ui.page('/')
async def main_page():
    setup_styles()
    with ui.dialog().classes('w-full max-w-5xl') as product_modal:
        app_logic.product_modal = product_modal
        with ui.card().classes('p-0 w-full rounded-[2.5rem] bg-white border-0 shadow-2xl'):
            modal_content()

    with ui.left_drawer(value=True, fixed=True).classes('p-0 shadow-none'):
        sidebar_area()
    with ui.column().classes('flex-1 w-full'):
        await content_area()

ui.run(title=TITLE, host='0.0.0.0', port=PORT, show=False, reload=False)
