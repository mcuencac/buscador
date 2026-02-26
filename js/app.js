/* =========================================================
   CONFIGURACIÓN GLOBAL
   ========================================================= */

// Esta es la clave para poder usar la API de OMDb (si no, no te deja)
const API_KEY = "9ee4e976";

// Esta es la dirección base de la API (luego le añadimos parámetros)
const BASE_URL = "https://www.omdbapi.com/";

// Esta imagen sale si la imagen del póster no se carga o la API no tiene póster
const FALLBACK_POSTER = "./img/not-found.jpg";

// Como OMDb no tiene un botón de "recomendadas", usamos estas palabras
// para pedir pelis a la API y así tener un listado inicial
const RECOMMENDED_SEEDS = [
  "batman",
  "harry potter",
  "spider-man",
  "star wars",
  "inception",
  "pixar",
  "marvel",
  "matrix"
];

// Número de películas que quiero enseñar al inicio
const RECOMMENDED_LIMIT = 15;


/* =========================================================
   REFERENCIAS AL DOM
   ========================================================= */

// Aquí guardo los elementos del HTML para usarlos con JavaScript. Seleccionmos elementos por su id para poder manipularlos después
const form = document.getElementById("searchForm");
const queryInput = document.getElementById("query");
const results = document.getElementById("results");
const statusEl = document.getElementById("status");
const clearBtn = document.getElementById("clearBtn");

// Selector de género 
const genreFilter = document.getElementById("genreFilter");


/* =========================================================
   ESTADO DE LA APLICACIÓN
   ========================================================= */

// Para acordarme de cuál fue la última búsqueda. 
// Con let declaramos una variable que puede cambiar su valor a lo largo del tiempo. 
// Aquí guardo el texto de la última búsqueda para poder volver a ella si el usuario quiere.
let lastQuery = "";

// Para guardar la lista de pelis que salieron en la búsqueda
// y poder volver desde el detalle. [] Significa una lista de elementos, si no hay nada dentro, es una lista vacía.
let lastMovies = [];

// Aquí guardo las recomendadas del inicio
let recommendedMovies = [];

// Esto es como una "memoria" para no pedir a la API lo mismo varias veces
// (key = imdbID, value = datos completos de la peli)
const detailsCache = new Map();

// Esta es la lista que está “activa” ahora mismo (la que se puede filtrar)
let currentMovies = [];


/* =========================================================
   TOOLTIP (SINOPSIS AL HOVER)
   ========================================================= */

// Creo un tooltip (capa flotante) una sola vez y lo reutilizo para todas las pelis
const tooltip = document.createElement("div");
tooltip.className = "tooltip";
document.body.appendChild(tooltip);

/**
 * Muestra el tooltip cerca del ratón
 * @param {string} text texto que quiero enseñar (sinopsis)
 * @param {number} x coordenada X del ratón
 * @param {number} y coordenada Y del ratón
 */
function showTooltip(text, x, y) {
  tooltip.textContent = text;
  tooltip.style.left = (x + 15) + "px";
  tooltip.style.top = (y + 15) + "px";
  tooltip.classList.add("visible");
}

/**
 * Oculta el tooltip
 */
function hideTooltip() {
  tooltip.classList.remove("visible");
}


/* =========================================================
   FUNCIONES UTILITARIAS
   ========================================================= */

/**
 * Escribe mensajes en la parte de estado (por ejemplo: "Buscando...")
 */
function setStatus(msg) {
  statusEl.textContent = msg;
}

/**
 * Devuelve una URL de póster válida.
 * Si la API devuelve "N/A" o viene vacío, ponemos la imagen de "not found"
 */
function getPosterUrl(movie) {
  const poster = (movie?.Poster || "").trim();
  if (!poster || poster === "N/A") return FALLBACK_POSTER;
  return poster;
}

/**
 * Convierte la puntuación de IMDb (0 a 10) en estrellitas (0 a 5)
 */
function renderStars(rating) {
  if (!rating || rating === "N/A") {
    return `<div class="stars"><span class="no-rating">Sin puntuación</span></div>`;
  }

  // Pasamos "7.8" (texto) a número
  const score = parseFloat(rating);

  // 10 puntos -> 5 estrellas, por eso dividimos entre 2
  const filled = Math.round(score / 2);

  // Construimos el HTML de estrellas (rellenas y vacías)
  let html = `<div class="stars">`;
  for (let i = 1; i <= 5; i++) {
    html += i <= filled ? "⭐" : "☆";
  }

  // También pongo el número para que se vea la nota exacta
  html += ` <span class="rating-number">${score}</span></div>`;
  return html;
}

/**
 * Mezcla un array (lista de elementos) para que no salga siempre igual (tipo barajar cartas)
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Quita películas repetidas usando imdbID (porque a veces salen duplicadas)
 */
function uniqueByImdbId(movies) {
  const map = new Map();
  movies.forEach(m => map.set(m.imdbID, m));
  return Array.from(map.values());
}

/**
 * Si la sinopsis no existe o es "N/A", pongo un mensaje normal
 */
function normalizePlot(plot) {
  const text = (plot || "").trim();
  if (!text || text === "N/A") return "Sin sinopsis disponible.";
  return text;
}

/**
 * La API trae Genre como texto: "Action, Adventure, Sci-Fi"
 * Yo lo convierto en lista: ["Action", "Adventure", "Sci-Fi"]
 */
function splitGenres(genreStr) {
  const text = (genreStr || "").trim();
  if (!text || text === "N/A") return [];
  return text.split(",").map(g => g.trim()).filter(Boolean);
}


/* =========================================================
   LLAMADAS A LA API
   ========================================================= */

/**
 * Busca películas por texto con el parámetro s=
 */
async function searchMovies(query, page = 1) {
  // encodeURIComponent es para que los espacios y signos no rompan la URL
  const url = `${BASE_URL}?apikey=${API_KEY}&s=${encodeURIComponent(query)}&page=${page}`;

  const response = await fetch(url);
  const data = await response.json();

  // Si la API dice False, es que no hay resultados o hay error
  if (data.Response === "False") {
    return { movies: [], error: data.Error };
  }

  // data.Search es el array de resultados
  return { movies: data.Search, error: null };
}

/**
 * Pide el detalle completo con i= (aquí viene Genre, Plot, imdbRating...)
 * Además uso cache para no repetir la misma petición
 */
async function getMovieById(id) {
  // Si ya lo tengo guardado, lo devuelvo y listo
  if (detailsCache.has(id)) return detailsCache.get(id);

  const url = `${BASE_URL}?apikey=${API_KEY}&i=${id}`;
  const response = await fetch(url);
  const data = await response.json();

  // Lo guardo para la próxima vez
  detailsCache.set(id, data);
  return data;
}


/* =========================================================
   FILTRO POR GÉNERO
   ========================================================= */

/**
 * Rellena el <select> con los géneros disponibles de las pelis actuales
 * (solo de las que estamos mostrando ahora)
 */
function populateGenreFilterFromCurrent() {
  // Si no existe el select, no hago nada (por si el HTML no lo tiene)
  if (!genreFilter) return;

  // Uso Set para no repetir géneros
  const genresSet = new Set();

  // Recorro pelis actuales y saco sus géneros desde el cache de detalles
  for (const m of currentMovies) {
    const detail = detailsCache.get(m.imdbID);
    const genres = splitGenres(detail?.Genre);
    genres.forEach(g => genresSet.add(g));
  }

  // Paso a array y ordeno para que salga bonito
  const genres = Array.from(genresSet).sort();

  // Meto las opciones en el select
  genreFilter.innerHTML = `
    <option value="all">Filtrar por género</option>
    ${genres.map(g => `<option value="${g}">${g}</option>`).join("")}
  `;
}

/**
 * Cuando el usuario elige un género, filtramos y volvemos a renderizar
 */
async function applyGenreFilter() {
  if (!genreFilter) return;

  const selected = genreFilter.value;

  // Si está en "all", muestro todo
  if (selected === "all") {
    await renderMovies(currentMovies);
    setStatus(`🎬 Mostrando: ${currentMovies.length}`);
    return;
  }

  // Si no, filtro las pelis que incluyen ese género
  const filtered = currentMovies.filter(m => {
    const detail = detailsCache.get(m.imdbID);
    const genres = splitGenres(detail?.Genre);
    return genres.includes(selected);
  });

  await renderMovies(filtered);
  setStatus(`🎬 ${selected}: ${filtered.length} resultados`);
}


/* =========================================================
   RENDERIZADO DEL LISTADO (RATING + TOOLTIP + CACHE)
   ========================================================= */

/**
 * Dibuja las películas en el grid
 * (y para cada peli pide el detalle para tener rating y sinopsis)
 */
async function renderMovies(movies) {
  // Por si había tooltip abierto, lo cierro
  hideTooltip();

  // Limpio el grid antes de volver a pintarlo
  results.innerHTML = "";

  // Recorro todas las pelis y creo una card por cada una
  for (const movie of movies) {

    // Pido detalle porque en la búsqueda s= no viene todo
    let detail;
    try {
      detail = await getMovieById(movie.imdbID);
    } catch (err) {
      // Si falla la API, pongo valores por defecto para no romper
      detail = { imdbRating: "N/A", Plot: "N/A", Genre: "N/A" };
      detailsCache.set(movie.imdbID, detail);
      console.error("Error obteniendo detalle:", err);
    }

    // Creo la tarjeta
    const article = document.createElement("article");
    article.className = "card";

    // Guardo el id para saber luego qué peli es si hago click
    article.dataset.id = movie.imdbID;

    // Meto el HTML de la tarjeta
    article.innerHTML = `
      <img
        class="poster"
        src="${getPosterUrl(movie)}"
        alt="${movie.Title}"
        loading="lazy"
      >
      <h3>${movie.Title}</h3>
      <p>${movie.Year}</p>
      ${renderStars(detail.imdbRating)}
    `;

    // La añado al grid (al contenedor de resultados)
    results.appendChild(article);

    // Si la imagen no carga, pongo la de fallback
    const img = article.querySelector(".poster");
    img.addEventListener("error", () => {
      img.src = FALLBACK_POSTER;
    });

    // Tooltip: saco la sinopsis y la normalizo
    const plotText = normalizePlot(detail.Plot);

    // Cuando entro con el ratón, muestro tooltip
    article.addEventListener("mouseenter", (e) => {
      showTooltip(plotText, e.pageX, e.pageY);
    });

    // Mientras muevo el ratón, muevo el tooltip para que siga al cursor
    article.addEventListener("mousemove", (e) => {
      tooltip.style.left = (e.pageX + 15) + "px";
      tooltip.style.top = (e.pageY + 15) + "px";
    });

    // Cuando salgo, lo oculto
    article.addEventListener("mouseleave", hideTooltip);
  }
}


/* =========================================================
   RENDERIZADO DEL DETALLE
   ========================================================= */

/**
 * Muestra una vista con todos los datos de una película
 */
function renderDetail(movie) {
  hideTooltip();

  results.innerHTML = `
    <article class="card detail">
      <button id="backBtn" type="button">⬅ Volver</button>

      <img
        id="detailPoster"
        class="poster"
        src="${getPosterUrl(movie)}"
        alt="${movie.Title}"
        loading="lazy"
      >

      <h2>${movie.Title} (${movie.Year || "N/A"})</h2>
      <p><strong>Tipo:</strong> ${movie.Type || "N/A"}</p>
      <p><strong>Género:</strong> ${movie.Genre || "N/A"}</p>
      <p><strong>Director:</strong> ${movie.Director || "N/A"}</p>
      <p><strong>Actores:</strong> ${movie.Actors || "N/A"}</p>
      <p><strong>IMDb:</strong> ${movie.imdbRating || "N/A"}</p>
      <p><strong>Sinopsis:</strong> ${movie.Plot || "N/A"}</p>
    </article>
  `;

  // Si falla la imagen del detalle, pongo la de fallback
  const detailImg = document.getElementById("detailPoster");
  detailImg.addEventListener("error", () => {
    detailImg.src = FALLBACK_POSTER;
  });

  // Botón volver: vuelvo al listado anterior (resultados o recomendadas)
  document.getElementById("backBtn").addEventListener("click", async () => {
    if (lastMovies.length) {
      currentMovies = lastMovies;
      await renderMovies(currentMovies);
      populateGenreFilterFromCurrent();
      if (genreFilter) await applyGenreFilter();
    } else {
      currentMovies = recommendedMovies;
      await renderMovies(currentMovies);
      populateGenreFilterFromCurrent();
      if (genreFilter) await applyGenreFilter();
      setStatus("🎬 Recomendadas para ti");
    }
  });
}


/* =========================================================
   RECOMENDADAS (AL INICIO)
   ========================================================= */

/**
 * Carga películas al inicio sin que el usuario busque nada
 */
async function loadRecommended() {
  setStatus("🎬 Cargando recomendadas...");

  try {
    // Mezclo seeds y me quedo con unas pocas para no hacer demasiadas peticiones
    const seeds = shuffle(RECOMMENDED_SEEDS).slice(0, 4);

    // Hago búsquedas a la vez (más rápido)
    const responses = await Promise.all(seeds.map(seed => searchMovies(seed)));

    // Junto todas las pelis de todas las búsquedas
    let movies = responses.flatMap(r => r.movies);

    // Quito duplicadas y vuelvo a mezclar
    movies = shuffle(uniqueByImdbId(movies));

    // Me quedo con un número máximo
    recommendedMovies = movies.slice(0, RECOMMENDED_LIMIT);

    // Las recomendadas pasan a ser la lista actual
    currentMovies = recommendedMovies;

    setStatus("🎬 Recomendadas para ti");
    await renderMovies(currentMovies);

    // Relleno el filtro por género (aunque lo vamos a ocultar si lo decides)
    populateGenreFilterFromCurrent();
    if (genreFilter) genreFilter.value = "all";

  } catch (err) {
    console.error(err);
    setStatus("❌ No se pudieron cargar recomendadas");
  }
}


/* =========================================================
   EVENTOS
   ========================================================= */

// Cuando el usuario busca (submit del formulario)
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const query = queryInput.value.trim();
  if (!query) return;

  // Guardo la búsqueda
  lastQuery = query;

  // Limpio la lista anterior
  lastMovies = [];

  hideTooltip();

  // Limpio la pantalla y pongo estado
  results.innerHTML = "";
  setStatus("Buscando...");

  try {
    const { movies, error } = await searchMovies(query);

    // Si hay error o no hay resultados, lo aviso
    if (error || !movies.length) {
      setStatus(`❌ ${error || "No se encontraron resultados."}`);

      // Si no hay resultados, oculto el filtro
      if (genreFilter) {
        genreFilter.style.display = "none";
      }

      return;
    }

    // Si hay resultados, los guardo
    lastMovies = movies;
    currentMovies = movies;

    setStatus(`✅ Resultados: ${movies.length}`);
    await renderMovies(currentMovies);

    // Si hay resultados, muestro el filtro
    if (genreFilter) {
      genreFilter.style.display = "inline-block";
      populateGenreFilterFromCurrent();
      genreFilter.value = "all";
    }

  } catch (err) {
    console.error(err);
    setStatus("❌ Error de red o conexión con la API");

    // Si falla internet o la API, oculto el filtro también
    if (genreFilter) {
      genreFilter.style.display = "none";
    }
  }
});

// Cuando hago click en una peli, cargo el detalle
results.addEventListener("click", async (e) => {
  const card = e.target.closest(".card");
  if (!card || !card.dataset.id) return;

  hideTooltip();
  setStatus("Cargando detalle...");

  try {
    const movie = await getMovieById(card.dataset.id);

    // Si la API dice que no, enseño error
    if (movie.Response === "False") {
      setStatus(`❌ ${movie.Error || "No se pudo cargar el detalle"}`);
      return;
    }

    // Si va bien, pinto el detalle
    renderDetail(movie);
    setStatus("");

  } catch (err) {
    console.error(err);
    setStatus("❌ Error cargando el detalle");
  }
});

// Botón restablecer: vuelvo a recomendadas y limpio todo
clearBtn.addEventListener("click", async () => {
  // Limpio input y variables
  queryInput.value = "";
  lastQuery = "";
  lastMovies = [];

  hideTooltip();

  setStatus("🎬 Recomendadas para ti");

  // Vuelvo a pintar recomendadas
  currentMovies = recommendedMovies;
  await renderMovies(currentMovies);

  // Oculto el filtro al restablecer
  if (genreFilter) {
    genreFilter.style.display = "none";
    genreFilter.value = "all";
  }

  // Pongo el cursor en el input para buscar rápido
  queryInput.focus();
});

// Cuando cambio el selector de género, aplico el filtro
if (genreFilter) {
  genreFilter.addEventListener("change", applyGenreFilter);
}


/* =========================================================
   INICIO DE LA APP
   ========================================================= */

// Al abrir la página, cargo recomendadas
loadRecommended();