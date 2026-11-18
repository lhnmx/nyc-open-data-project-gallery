# Recreating the NYC 311 Map in R

This guide documents how to recreate the exact layout, interactive map, sidebar filters, and animated timeline in **R** using **R Shiny** and modern spatial packages.

---

## 1. Package Equivalents

| Current Stack (Vite + React) | R Equivalent | Purpose |
| :--- | :--- | :--- |
| **MapLibre GL** (`maplibre-gl`) | **`mapgl`** (or `leaflet`) | WebGL vector map rendering with Carto Positron basemap |
| **Tailwind CSS + Glassmorphism** | **`bslib`** (Bootstrap 5) | Modern collapsible sidebar, metric cards, and theme |
| **Custom Timeline Scrubber** | `sliderInput(..., animate = TRUE)` | Timeline slider with native Play / Pause animation |
| **Choropleth Layer** | `mapgl::add_fill_layer()` or `leaflet::addPolygons()` | Shading every ZIP code polygon based on complaint count |
| **Heatmap Layer** | `mapgl::add_heatmap_layer()` or `leaflet.extras::addHeatmap()` | Continuous density gradient for complaint hotspots |
| **Client-side State** | **Shiny Reactivity** (`reactive()`, `renderMaplibre()`) | Real-time filtering by borough, complaint type, & month |

---

## 2. Prerequisites & Installation

In your R console, install the required packages:

```r
# Core Shiny & UI
install.packages(c("shiny", "bslib", "dplyr", "sf", "lubridate"))

# Modern MapLibre GL wrapper for R (recommmended for identical look)
install.packages("mapgl")

# Or alternative classic Leaflet
install.packages("leaflet")
```

---

## 3. Full Reproducible R Shiny App (`app.R`)

Save this code as `app.R` in your project or a subfolder. It reads the same pre-processed GeoJSON file created by your Python script (`public/data/rodent_sample.geojson`).

```r
library(shiny)
library(bslib)
library(mapgl)       # MapLibre GL wrapper for R
library(sf)
library(dplyr)
library(lubridate)

# 1. Load Pre-processed 311 GeoJSON & Borough Boundaries
geojson_path <- "public/data/rodent_sample.geojson"
boroughs_path <- "public/data/nyc_boroughs.geojson"

boroughs_sf <- if (file.exists(boroughs_path)) st_read(boroughs_path, quiet = TRUE) else NULL

if (file.exists(geojson_path)) {
  data_311 <- st_read(geojson_path, quiet = TRUE) %>%
    mutate(
      date = as.Date(date),
      month_num = month(date),
      month_label = format(date, "%b %Y")
    )
} else {
  # Fallback dummy data if file not yet downloaded
  data_311 <- st_sf(
    id = 1:5,
    borough = c("Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"),
    desc = rep("Rodents", 5),
    month_num = rep(7, 5),
    geometry = st_sfc(
      st_point(c(-73.97, 40.78)),
      st_point(c(-73.94, 40.67)),
      st_point(c(-73.79, 40.72)),
      st_point(c(-73.86, 40.84)),
      st_point(c(-74.15, 40.57)),
      crs = 4326
    )
  )
}

# Borough coordinates for fly-to actions
borough_coords <- list(
  "All"           = c(-73.96, 40.73, 10.5),
  "Manhattan"     = c(-73.9712, 40.7831, 11.5),
  "Brooklyn"      = c(-73.9442, 40.6782, 11),
  "Queens"        = c(-73.7949, 40.7282, 10.5),
  "Bronx"         = c(-73.8648, 40.8448, 11),
  "Staten Island" = c(-74.1502, 40.5795, 11)
)

# 2. User Interface (UI)
ui <- page_sidebar(
  title = "NYC 311 Explorer",
  theme = bs_theme(
    bootswatch = "cosmo",
    primary = "#2563eb",
    base_font = font_google("Inter")
  ),
  fillable = TRUE,
  
  # Sidebar: Filters
  sidebar = sidebar(
    title = "Filters & Layers",
    width = 340,
    
    textInput("search", "Search Location", placeholder = "ZIP code, neighborhood..."),
    
    selectInput(
      "borough", "Borough",
      choices = c("All", "Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"),
      selected = "All"
    ),
    
    radioButtons(
      "category", "Complaint Type",
      choices = c("Rodent / Pest", "Noise - Residential", "Heat & Hot Water"),
      selected = "Rodent / Pest"
    ),
    
    hr(),
    
    # Metrics Summary Card
    card(
      card_header("Dataset Summary"),
      textOutput("record_count"),
      class = "bg-light border-0 shadow-sm"
    )
  ),
  
  # Main Layout: Map + Floating Timeline Card
  div(
    class = "position-relative w-100 h-100",
    
    # Map Canvas
    maplibreOutput("map", height = "100%", width = "100%"),
    
    # Floating Timeline Card at Bottom
    div(
      class = "position-absolute bottom-0 start-50 translate-middle-x mb-4 shadow-lg rounded-4 p-3",
      style = "width: 85%; max-width: 800px; z-index: 1000; background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(8px); border: 1px solid #e2e8f0;",
      
      div(
        class = "d-flex justify-content-between align-items-center mb-1",
        span(class = "text-muted small fw-bold text-uppercase", "Timeline Period"),
        span(class = "badge bg-primary text-white", textOutput("active_month_label", inline = TRUE))
      ),
      
      # Slider with Native Play / Pause Animation
      sliderInput(
        "month_slider",
        label = NULL,
        min = 1,
        max = 12,
        value = 7,
        step = 1,
        ticks = TRUE,
        width = "100%",
        animate = animationOptions(
          interval = 1200,   # 1.2s per step
          loop = TRUE,       # Loop when reaching December
          playButton = "▶ Play",
          pauseButton = "⏸ Pause"
        )
      )
    )
  )
)

# 3. Server Logic
server <- function(input, output, session) {
  
  # Reactive subset based on filters
  filtered_data <- reactive({
    df <- data_311
    
    # Filter by Borough
    if (input$borough != "All") {
      df <- df %>% filter(borough == input$borough)
    }
    
    # Filter by Month
    if ("month_num" %in% colnames(df)) {
      df <- df %>% filter(month_num == input$month_slider)
    }
    
    # Filter by Search Term
    if (nzchar(input$search)) {
      df <- df %>% filter(grepl(input$search, zip, ignore.case = TRUE) | 
                          grepl(input$search, desc, ignore.case = TRUE))
    }
    
    df
  })
  
  # Summary text
  output$record_count <- renderText({
    paste(nrow(filtered_data()), "complaints in selected view")
  })
  
  output$active_month_label <- renderText({
    month.name[input$month_slider]
  })
  
  # Initial MapLibre Render (Carto Positron Light Mode)
  output$map <- renderMaplibre({
    m <- maplibre(
      style = carto_style("positron"),
      center = c(-73.96, 40.73),
      zoom = 10.5
    )
    if (!is.null(boroughs_sf)) {
      m <- m %>%
        add_line_layer(
          id = "borough-borders",
          source = boroughs_sf,
          line_color = "#94a3b8",
          line_width = 1.2,
          line_opacity = 0.6
        )
    }
    m
  })
  
  # Update Points or Heatmap Layer Reactively
  observe({
    pts <- filtered_data()
    req(nrow(pts) > 0)
    
    # Heatmap Layer in R (mapgl)
    maplibre_proxy("map") %>%
      clear_layer("heatmap") %>%
      add_heatmap_layer(
        id = "heatmap",
        source = pts,
        heatmap_weight = 1,
        heatmap_intensity = 2.5,
        heatmap_radius = 25,
        heatmap_opacity = 0.85
      )
  })
  
  # Camera fly-to when Borough dropdown changes
  observeEvent(input$borough, {
    coords <- borough_coords[[input$borough]]
    if (!is.null(coords)) {
      maplibre_proxy("map") %>%
        fly_to(center = c(coords[1], coords[2]), zoom = coords[3], pitch = 25)
    }
  })
}

shinyApp(ui, server)
```

---

## 4. Alternative: Classic Leaflet with Clustering

If you prefer using the traditional `leaflet` package:

```r
library(leaflet)

# Render base map
output$map <- renderLeaflet({
  leaflet() %>%
    addProviderTiles(providers$CartoDB.Positron) %>%
    setView(lng = -73.96, lat = 40.73, zoom = 11)
})

# Update markers with clustering
observe({
  pts <- filtered_data()
  leafletProxy("map", data = pts) %>%
    clearMarkerClusters() %>%
    clearMarkers() %>%
    addCircleMarkers(
      clusterOptions = markerClusterOptions(),
      color = "#0284c7",
      fillOpacity = 0.8,
      radius = 6,
      popup = ~desc
    )
})
```

---

## 5. Deployment Options for R

| Service | Cost | Supports R Shiny? | Notes |
| :--- | :--- | :--- | :--- |
| **Vercel** | Free | ❌ **No** | Vercel is serverless-only and does not support persistent R WebSocket servers. |
| **shinyapps.io** | **Free tier** (5 active apps, 25 active hours/mo) | ✅ **Yes** | 1-click deployment from RStudio (`rsconnect::deployApp()`). |
| **Render / Railway** | ~$5/month (or free trial) | ✅ **Yes** | Deploys using a simple `Dockerfile` based on `rocker/shiny`. |
| **Posit Connect Cloud** | Free / Tiered | ✅ **Yes** | Posit's official hosted platform for Shiny & Quarto. |
| **Shinylive for R** (WebR) | Free (GitHub Pages / Vercel) | ⚠️ **Experimental** | Compiles R to WebAssembly in the browser, but has a large initial download (~30MB) and limited spatial packages. |
