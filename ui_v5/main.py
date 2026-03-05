from nicegui import ui
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURAZIONE ---
BACKEND_URL = os.getenv("API_URL", "http://127.0.0.1:8000")
TITLE = "CONTENTHUNTER PIM | PROFESSIONAL"
PORT = 3001

# --- LOGICA ---
class PIMApp:
    def __init__(self):
        self.active_page = 'dashboard'
        self.data = []
        self.loading = False
        self.selected_product = None
        self.product_modal = None

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
                        self.data = raw_data.get('products', raw_data) if 'products' in raw_data else raw_data
            except Exception:
                self.data = []
        
        self.loading = False
        content_area.refresh()

app_logic = PIMApp()

# --- DESIGN SYSTEM ---
def setup_styles():
    ui.colors(primary='#E53E3E', secondary='#EAD8B1', accent='#1A202C')
    ui.query('body').style('background-color: #F8F9FA; font-family: "Inter", sans-serif;')
    ui.add_head_html('''
        <style>
            /* Sidebar Styling */
            .q-drawer { background: #FFFFFF !important; border-right: 1px solid #E2E8F0 !important; }
            .sidebar-pill { 
                margin: 4px 16px !important; 
                border-radius: 12px !important; 
                transition: all 0.2s; 
                font-weight: 500; 
                color: #4A5568 !important; 
                min-height: 48px !important;
            }
            .sidebar-pill.active { 
                background-color: #EAD8B1 !important; 
                color: #1A202C !important; 
                font-weight: 700 !important;
            }
            .group-label { 
                font-size: 11px; font-weight: 800; color: #718096; 
                letter-spacing: 0.1em; padding: 25px 28px 10px 28px; 
                text-transform: uppercase; 
            }
            .group-label-red { 
                font-size: 11px; font-weight: 800; color: #E53E3E; 
                letter-spacing: 0.1em; padding: 25px 28px 10px 28px; 
                text-transform: uppercase; 
            }
            
            /* Profile Card */
            .profile-box { 
                background: #F1F5F9; border-radius: 12px; margin: 0 16px; padding: 12px;
            }
            .version-txt { color: #E53E3E; font-size: 10px; font-weight: 900; padding: 10px 28px; }
            
            /* Main Content */
            .dashboard-card { border-radius: 20px; background: white; border: 1px solid #F1F5F9; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
            .kpi-box { border-radius: 20px; background: white; padding: 30px; border: 1px solid #F1F5F9; }
        </style>
    ''')

# --- SIDEBAR COMPONENT ---
@ui.refreshable
def sidebar_area():
    with ui.column().classes('w-full gap-0 h-full'):
        # Logo Section
        with ui.column().classes('items-center w-full py-10'):
            with ui.element('div').classes('w-32 h-32 bg-white flex items-center justify-center'):
                # Sostituisci questo icon col tuo logo reale se ne hai uno
                ui.icon('hub', color='red-7', size='4.5rem')
            ui.label('CONTENT HUNTER').classes('text-sm font-black text-red-700 tracking-widest mt-2')

        # Menu Main
        ui.label('MENU PRINCIPALE').classes('group-label')
        sidebar_button('Dashboard', 'space_dashboard', 'dashboard')
        sidebar_button('Master ERP', 'inventory', 'products')
        sidebar_button('Import Lab', 'auto_awesome', 'import')
        sidebar_button('Cataloghi', 'folder_copy', 'repos')
        
        # Menu Contabilità
        ui.label('CONTABILITÀ').classes('group-label-red')
        sidebar_button('Analisi Hub', 'analytics', 'analytics')
        
        # Menu Tabelle
        ui.label('TABELLE COMUNI').classes('group-label')
        sidebar_button('Brand Library', 'branding_watermark', 'brands')
        sidebar_button('Categorie', 'account_tree', 'categories')
        
        ui.space()
        
        # Footer Section
        ui.label('V. 5.1 [05/03/2026]').classes('version-txt')
        
        with ui.row().classes('profile-box items-center gap-3'):
            with ui.element('div').classes('w-10 h-10 bg-white rounded-lg flex items-center justify-center text-slate-300 font-bold text-lg border border-slate-100'):
                ui.label('a')
            with ui.column().classes('gap-0'):
                ui.label('Administrator').classes('text-sm font-bold text-slate-700')
                ui.label('ADMIN').classes('text-[9px] font-black text-slate-400 uppercase tracking-tighter')
        
        with ui.button(on_click=lambda: ui.notify('Logout')).classes('w-full justify-start py-6 px-10 text-slate-400 font-bold').props('flat no-caps'):
            with ui.row().classes('items-center gap-4'):
                ui.icon('logout', size='20px')
                ui.label('ESCI')

def sidebar_button(label: str, icon: str, page_name: str):
    is_active = app_logic.active_page == page_name
    with ui.button(on_click=lambda: app_logic.navigate_to(page_name)).classes(f'w-full justify-start sidebar-pill {"active" if is_active else ""}').props('flat no-caps'):
        with ui.row().classes('items-center gap-4'):
            ui.icon(icon, size='22px', color='slate-500' if not is_active else 'slate-900')
            ui.label(label)

# --- CONTENT AREA ---
@ui.refreshable
async def content_area():
    with ui.column().classes('w-full p-16 gap-10'):
        with ui.column().classes('gap-1'):
            ui.label('Sistema di Gestione Anagrafica').classes('text-3xl font-black text-slate-800 tracking-tight')
            ui.label('Inserimento e interrogazione dati centralizzata').classes('text-slate-400 text-sm')

        if app_logic.active_page == 'dashboard':
            # Row di KPI
            with ui.row().classes('w-full gap-8'):
                with ui.column().classes('kpi-box flex-1 shadow-sm'):
                    ui.label('ASSETS TOTALI').classes('text-[10px] font-black text-slate-400 tracking-widest')
                    ui.label('3.840').classes('text-3xl font-black text-slate-900 mt-1')
                with ui.column().classes('kpi-box flex-1 shadow-sm'):
                    ui.label('CATALOGHI ATTIVI').classes('text-[10px] font-black text-slate-400 tracking-widest')
                    ui.label('14').classes('text-3xl font-black text-slate-900 mt-1')
                with ui.column().classes('kpi-box flex-1 shadow-sm'):
                    ui.label('OPERAZIONI OGGI').classes('text-[10px] font-black text-slate-400 tracking-widest')
                    ui.label('156').classes('text-3xl font-black text-slate-900 mt-1')

@ui.page('/')
async def main_page():
    setup_styles()
    with ui.left_drawer(value=True, fixed=True).classes('p-0'):
        sidebar_area()
    with ui.column().classes('flex-1 w-full bg-[#F8F9FA] min-h-screen'):
        await content_area()

ui.run(title=TITLE, host='0.0.0.0', port=PORT, show=False, reload=False)
