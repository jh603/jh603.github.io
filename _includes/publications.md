<h2 id="publications">Selected Publications</h2>

<div class="publications">
<ol class="bibliography">

{% for link in site.data.publications.main %}

<li>
<div class="pub-row{% unless link.image %} no-teaser{% endunless %}">
  {% if link.image %}
  <!-- The badge is absolutely positioned by publications.css, so this element
       must establish a containing block. Kept inline as well as in custom.css
       so a stale or failed stylesheet cannot fling the badge to the page corner. -->
  <div class="col-sm-3 abbr" style="position: relative;">
    <img src="{{ link.image }}" class="teaser img-fluid z-depth-1">
    {% if link.conference_short %}
    <abbr class="badge">{{ link.conference_short }}</abbr>
    {% endif %}
  </div>
  {% endif %}
  <div class="col-sm-9">
      <div class="title"><a href="{{ link.pdf }}">{{ link.title }}</a></div>
      <div class="author">{{ link.authors }}</div>
      <div class="periodical"><em>{{ link.conference }}</em>
      </div>
    <div class="links">
      {% if link.pdf %}
      <a href="{{ link.pdf }}" class="btn btn-sm z-depth-0" role="button" target="_blank">PDF</a>
      {% endif %}
      {% if link.code %}
      <a href="{{ link.code }}" class="btn btn-sm z-depth-0" role="button" target="_blank">Code</a>
      {% endif %}
      {% if link.page %}
      <a href="{{ link.page }}" class="btn btn-sm z-depth-0" role="button" target="_blank">Project Page</a>
      {% endif %}
      {% if link.bibtex %}
      <a href="{{ link.bibtex }}" class="btn btn-sm z-depth-0" role="button" target="_blank">BibTex</a>
      {% endif %}
      {% if link.notes %}
      <strong> <i style="color:#e74d3c">{{ link.notes }}</i></strong>
      {% endif %}
      {% if link.others %}
      {{ link.others }}
      {% endif %}
    </div>
  </div>
</div>
</li>

{% endfor %}

</ol>
</div>
