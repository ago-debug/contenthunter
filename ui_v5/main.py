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
    ui.colors(primary='#111827', secondary='#F3F4F6', accent='#6B7280')
    ui.query('body').style('background-color: #F9FAFB; font-family: "Inter", sans-serif;')
    ui.add_head_html('''
        <style>
            .q-drawer { background: #FFFFFF !important; border-right: 1px solid #E5E7EB !important; }
            
            /* Sidebar Item - Industrial Pill */
            .sidebar-btn { 
                margin: 4px 16px !important; 
                border-radius: 12px !important; 
                transition: all 0.2s; 
                color: #64748B !important; 
                font-weight: 600 !important;
                height: 48px !important;
                text-transform: none !important;
            }
            .sidebar-btn.active { 
                background-color: #111827 !important; 
                color: #FFFFFF !important; 
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            .sidebar-btn:hover:not(.active) {
                background-color: #F8FAFC !important;
                color: #111827 !important;
            }
            
            /* Labels */
            .group-label { 
                font-size: 10px; font-weight: 900; color: #94A3B8; 
                letter-spacing: 0.15em; padding: 25px 28px 8px 28px; 
            }
            .version-label { 
                font-size: 10px; font-weight: 900; color: #64748B; 
                padding: 15px 28px; letter-spacing: 0.05em;
            }

            /* Bottom Profile Box */
            .profile-card { 
                background: #F8FAFC; border-radius: 12px; margin: 0 16px 16px 16px; padding: 12px;
                border: 1px solid #F1F5F9;
            }
            
            /* Dashboard Card */
            .kpi-card { 
                border-radius: 20px; background: white; border: 1px solid #F1F5F9; 
                padding: 30px; box-shadow: 0 1px 2px rgba(0,0,0,0.03); 
            }
        </style>
    ''')

# --- SIDEBAR ---
@ui.refreshable
def sidebar_area():
    with ui.column().classes('w-full gap-0 h-full'):
        # Logo Section
        with ui.column().classes('items-center w-full py-12 px-6'):
            with ui.element('div').classes('w-24 h-24 bg-slate-900 rounded-2xl flex items-center justify-center shadow-2xl mb-4'):
                ui.icon('precision_manufacturing', size='3rem', color='white')
            ui.label('CONTENT HUNTER').classes('text-sm font-black tracking-[0.2em] text-slate-900')
            ui.label('ENGINE PIM').classes('text-[8px] font-black text-slate-300 tracking-[0.4em]')

        # Main Navigation
        ui.label('MENU PRINCIPALE').classes('group-label')
        sidebar_button('Dashboard', 'o_space_dashboard', 'dashboard')
        sidebar_button('Master ERP', 'o_inventory', 'products')
        sidebar_button('Import Lab', 'o_auto_awesome', 'import')
        sidebar_button('Cataloghi', 'o_folder_copy', 'repos')
        
        ui.label('ANAGRAFICHE').classes('group-label')
        sidebar_button('Brand Library', 'o_branding_watermark', 'brands')
        sidebar_button('Categorie', 'o_account_tree', 'categories')
        
        ui.space()
        
        # User & Footer
        ui.label('V. 6.0 [05/03/2026]').classes('version-label')
        
        with ui.row().classes('profile-card items-center gap-4'):
            with ui.element('div').classes('w-10 h-10 bg-white rounded-lg flex items-center justify-center text-slate-400 font-black border'):
                ui.label('a')
            with ui.column().classes('gap-0'):
                ui.label('Administrator').classes('text-xs font-black text-slate-800')
                ui.label('SYSTEM ADMIN').classes('text-[9px] font-black text-slate-400 uppercase tracking-tighter')
        
        with ui.button(on_click=lambda: ui.notify('Logout')).classes('w-full justify-start py-6 px-10 text-slate-400 font-bold').props('flat no-caps'):
            with ui.row().classes('items-center gap-4'):
                ui.icon('o_logout', size='20px')
                ui.label('ESCI')

def sidebar_button(label: str, icon: str, page_name: str):
    is_active = app_logic.active_page == page_name
    with ui.button(on_click=lambda: app_logic.navigate_to(page_name)).classes(f'sidebar-btn {"active" if is_active else ""}').props('flat no-caps'):
        with ui.row().classes('items-center gap-4 w-full h-full'):
            ui.icon(icon, size='22px')
            ui.label(label).classes('text-[14px]')

# --- CONTENT ---
@ui.refreshable
async def content_area():
    with ui.column().classes('w-full p-16 gap-10 max-w-7xl mx-auto'):
        with ui.column().classes('gap-1 mb-4'):
            ui.label('Industrial Data Hub').classes('text-4xl font-black text-slate-900 tracking-tighter')
            ui.label('Interrogazione centralizzata e gestione asset PIM').classes('text-slate-400 text-sm')

        if app_logic.active_page == 'dashboard':
            with ui.row().classes('w-full gap-8'):
                kpi_box('ASSETS TOTALI', '3.840', 'o_layers')
                kpi_box('CATALOGHI', '14', 'o_folder')
                kpi_box('SYNC STATUS', '100%', 'o_cloud_done')

            with ui.column().classes('w-full kpi-card mt-4'):
                ui.label('ATTIVITÀ RECENTI').classes('text-[10px] font-black text-slate-400 tracking-widest mb-6')
                for _ in range(3):
                    with ui.row().classes('w-full py-5 border-b border-slate-50 items-center justify-between'):
                        ui.label('Sync Master ERP Repository').classes('font-black text-slate-800')
                        ui.badge('VERIFICATO').props('color=slate-1 text-slate-5 font-bold')

def kpi_box(label, value, icon):
    with ui.column().classes('kpi-card flex-1'):
        with ui.element('div').classes('p-3 bg-slate-50 rounded-xl mb-4 inline-block border'):
            ui.icon(icon, color='slate-900', size='24px')
        ui.label(label).classes('text-[10px] font-black text-slate-400 tracking-widest')
        ui.label(value).classes('text-3xl font-black text-slate-900 mt-1')

@ui.page('/')
async def main_page():
    setup_styles()
    with ui.left_drawer(value=True, fixed=True).classes('p-0 shadow-none'):
        sidebar_area()
    with ui.column().classes('flex-1 w-full'):
        await content_area()

ui.run(title=TITLE, host='0.0.0.0', port=PORT, show=False, reload=False)
