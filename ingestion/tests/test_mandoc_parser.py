from __future__ import annotations

from ingestion.mandoc_parser import parse_mandoc_html


def test_parse_mandoc_html_extracts_core_fields() -> None:
    html = """<!doctype html>
<html>
  <body>
    <div class="manual-text">
      <section class="Sh">
        <h1 class="Sh" id="NAME"><a class="permalink" href="#NAME">NAME</a></h1>
        <p class="Pp">ls - list directory contents</p>
      </section>
      <section class="Sh">
        <h1 class="Sh" id="DESCRIPTION">
          <a class="permalink" href="#DESCRIPTION">DESCRIPTION</a>
        </h1>
        <dl class="Bl-tag">
          <dt id="a"><a class="permalink" href="#a"><b>-a</b>, <b>--all</b></a></dt>
          <dd>do not ignore entries starting with .</dd>
          <dt id="A"><a class="permalink" href="#A"><b>-A</b></a></dt>
          <dd>do not list implied . and ..</dd>
        </dl>
      </section>
      <section class="Sh">
        <h1 class="Sh" id="SEE ALSO"><a class="permalink" href="#SEE ALSO">SEE ALSO</a></h1>
        <p class="Pp"><a class="Xr">tar(1)</a>, <a class="Xr">ssh_config(5)</a></p>
      </section>
    </div>
  </body>
</html>
"""
    parsed = parse_mandoc_html(html)

    assert parsed.description == "list directory contents"
    assert parsed.doc.toc[0].id == "name"
    assert parsed.doc.toc[1].id == "description"
    assert parsed.doc.toc[2].id == "see-also"

    assert parsed.options is not None
    assert [o.anchorId for o in parsed.options[:2]] == ["a", "A"]

    assert parsed.see_also is not None
    assert [(r.name, r.section) for r in parsed.see_also] == [("tar", "1"), ("ssh_config", "5")]
