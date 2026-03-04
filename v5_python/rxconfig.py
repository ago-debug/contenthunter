import reflex as rx

config = rx.Config(
    app_name="v5_python",
    tailwind={
        "theme": {
            "extend": {
                "colors": {
                    "slate": {
                        "900": "#0F172A",
                        "800": "#1E293B",
                        "700": "#334155",
                    },
                    "orange": {
                        "500": "#F97316",
                        "600": "#EA580C",
                    }
                }
            }
        }
    }
)
