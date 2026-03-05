from nicegui import ui
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

# CONFIGURAZIONE
BACKEND_URL = os.getenv("API_URL", "http://backend:8000")
TITLE = "CONTENTHUNTER PIM | ENTERPRISE"

# TEMA TIPO BITRIX24 (Light & Rounded)
light_theme = {
    'primary': '#212121',
    'secondary': '#757575',
    'accent': '#E0E0E0',
    'dark': '#1D1D1D',
    'positive': '#4CAF50',
    'negative': '#F44336',
    'info': '#2196F3',
    'warning': '#FFC107'
}

def setup_styles():
    ui.colors(**light_theme)
    # Background generale grigio chiarissimo tipico di Bitrix
    ui.query('body').style('background-color: #F4F7F9; color: #333333; font-family: "Inter", sans-serif;')
    ui.add_head_html('''
        <style>
            .sidebar-item { border-radius: 12px !important; margin: 2px 0; transition: all 0.2s; }
            .sidebar-item:hover { background-color: rgba(0,0,0,0.05) !important; }
            .sidebar-item.active { background-color: #E2E8F0 !important; color: #000 !important; font-weight: 700; }
            .q-drawer { background: #EEF2F7 !important; border-right: 1px solid #DFE5ED !important; }
            .badge-red { background: #FF5752; color: white; border-radius: 50%; padding: 2px 6px; font-size: 10px; font-weight: bold; position: absolute; top: 10px; right: 10px; }
            .main-card { border-radius: 16px; border: 1px solid #E2E8F0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); background: white; }
            .gradient-btn { background: linear-gradient(90deg, #FF8C67 0%, #F15CAB 100%); color: white; border-radius: 12px; font-weight: bold; }
        </style>
    ''')

def sidebar_item(label: str, icon: str, badge: str = None, active: bool = False):
    with ui.button(on_click=lambda: ui.notify(f'Navigazione: {label}')).classes(f'w-full justify-start py-3 px-4 sidebar-item {"active" if active else "text-gray-500"}').props('flat no-caps'):
        with ui.row().classes('items-center gap-3 w-full'):
            ui.icon(icon).classes('text-lg')
            ui.label(label).classes('text-sm')
            if badge:
                with ui.element('span').classes('badge-red'):
                    ui.label(badge)

class PIMApp:
    def __init__(self):
        self.catalogs = []
        self.master_products = []

    async def fetch_catalogs(self):
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"{BACKEND_URL}/api/v5/repositories")
                if resp.status_code == 200:
                    self.catalogs = resp.json()
                    return self.catalogs
        except:
            return []

app_logic = PIMApp()

@ui.page('/')
async def main_page():
    setup_styles()
    
    # 1. HEADER (Floating style)
    with ui.header().classes('bg-white text-gray-800 border-b border-gray-200 px-8 py-3 flex justify-between items-center z-10'):
        with ui.row().classes('items-center gap-2'):
            ui.icon('menu').classes('cursor-pointer md:hidden')
            ui.label('Industrial Dismantler Engine').classes('text-xs font-bold opacity-40 uppercase tracking-widest')
        
        with ui.row().classes('items-center gap-6'):
            ui.icon('search').classes('text-gray-400')
            ui.icon('notifications').classes('text-gray-400')
            with ui.row().classes('items-center gap-2'):
                ui.label('Augusto Genca').classes('text-sm font-medium')
                ui.avatar('AG').classes('text-[10px] bg-slate-200 text-slate-600')

    # 2. SIDEBAR (Bitrix Style)
    with ui.left_drawer(value=True).classes('p-4 flex flex-col gap-1'):
        with ui.column().classes('mb-8 px-2'):
            ui.label('CONTENTHUNTER').classes('text-xl font-black tracking-tighter text-[#2C3E50]')
            ui.label('PIM SYSTEM V5').classes('text-[10px] font-bold text-blue-500 tracking-[3px] -mt-1 uppercase')
            
        with ui.column().classes('w-full gap-1'):
            ui.label('COLLABORAZIONE').classes('text-[10px] text-gray-400 font-bold px-4 mb-2 mt-4 uppercase')
            sidebar_item('Dashboard', 'dashboard', active=True)
            sidebar_item('Messenger', 'chat', badge='12')
            sidebar_item('Messenger', 'chat', badge='12')
            sidebar_item('Documenti', 'description')
            
            ui.label('PIM & ERP').classes('text-[10px] text-gray-400 font-bold px-4 mb-2 mt-4 uppercase')
            sidebar_item('Master Library', 'database', badge='new')
            sidebar_item('Import PDF', 'file_upload')
            sidebar_item('Asset Matcher', 'hub')
            
            ui.label('SISTEMA').classes('text-[10px] text-gray-400 font-bold px-4 mb-2 mt-4 uppercase')
            sidebar_item('Impostazioni', 'settings')

        ui.space()
        
        # Pulsante Gradient tipo Bitrix
        ui.button('Fai l\'upgrade del piano', icon='rocket_launch').classes('w-full py-4 gradient-btn text-xs mb-4').props('no-caps flat')

    # 3. CONTENUTO PRINCIPALE
    with ui.column().classes('p-8 w-full gap-8'):
        with ui.row().classes('w-full justify-between items-end'):
            with ui.column().classes('gap-1'):
                ui.label('Dashboard Repository').classes('text-2xl font-bold text-slate-800')
                ui.label('Gestisci i tuoi canali di acquisizione dati.').classes('text-slate-400 text-sm')
            ui.button('NUOVO CATALOGO', icon='add', color='primary').classes('rounded-full px-6').props('no-caps')

        # Griglia Cataloghi con nuove Card
        catalog_grid = ui.grid(columns=4).classes('w-full gap-6')
        catalogs = await app_logic.fetch_catalogs()
        
        if not catalogs:
            for i in range(4): # Placeholder visuals
                with catalog_grid:
                    with ui.card().classes('main-card p-0 overflow-hidden'):
                         with ui.column().classes('p-6 gap-3'):
                            ui.avatar('folder', color='blue-1', text_color='blue-600').classes('rounded-xl')
                            ui.label('Catalogo Demo').classes('text-lg font-bold text-slate-800')
                            ui.label('In attesa di dati...').classes('text-xs text-slate-400')
                            ui.separator().classes('my-2')
                            ui.button('GESTISCI', color='slate-50').classes('w-full text-slate-600 rounded-lg').props('flat no-caps')
        else:
            for c in catalogs:
                with catalog_grid:
                    with ui.card().classes('main-card p-6 gap-4'):
                        with ui.row().classes('w-full justify-between items-start'):
                            ui.avatar('folder', color='blue-50', text_color='blue-500').classes('rounded-lg')
                            ui.badge(c['status'].upper()).props('outline color=blue-3')
                        ui.label(c['name']).classes('text-lg font-bold text-slate-800')
                        ui.label(f"Prodotti trovati: {c.get('product_count', 0)}").classes('text-xs text-slate-400')
                        ui.button('APRI REPOSITORY', color='primary').classes('w-full rounded-xl mt-2').props('no-caps')

ui.run(title=TITLE, port=3001)
