from __future__ import annotations

from pathlib import Path

from ingestion.mandoc_parser import parse_mandoc_html

_FIXTURES = Path(__file__).parent / "fixtures" / "mandoc"


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


def test_parse_mandoc_html_falls_back_to_body_container() -> None:
    html = """<!doctype html>
<html>
  <body>
    <section class="Sh">
      <h1 class="Sh" id="NAME"><a class="permalink" href="#NAME">NAME</a></h1>
      <p class="Pp">ls - list directory contents</p>
    </section>
  </body>
</html>
"""
    parsed = parse_mandoc_html(html)
    assert parsed.description == "list directory contents"


def test_parse_mandoc_html_treats_ip_bullets_as_lists_with_prose_continuations() -> None:
    html = (_FIXTURES / "wcurl-description.html").read_text(encoding="utf-8")

    parsed = parse_mandoc_html(html)

    description_blocks = parsed.doc.blocks[1:]
    assert not any(block.type in {"definition_list", "code_block"} for block in description_blocks)
    bullet_list = next(block for block in description_blocks if block.type == "list")
    assert bullet_list.type == "list"
    assert bullet_list.ordered is False
    assert len(bullet_list.items) == 12
    assert all([block.type for block in item] == ["paragraph"] for item in bullet_list.items)
    assert bullet_list.items[0][0].inlines[0].text == "Percent-encode whitespace in URLs;"
    assert bullet_list.items[1][0].inlines[0].text == (
        "Download multiple URLs in parallel if the installed curl's version is >= 7.66.0 "
        "(--parallel);"
    )
    assert bullet_list.items[5][0].inlines[0].text == (
        "Avoid overwriting files if the installed curl's version is >= 7.83.0 (--no-clobber);"
    )
    assert "\\n" not in bullet_list.items[5][0].inlines[0].text
    assert parsed.options is None


def test_parse_mandoc_html_pre_uses_real_newlines_between_nested_elements() -> None:
    html = """<!doctype html>
<html>
  <body>
    <div class="manual-text">
      <pre>first line<br>second <b>line</b></pre>
    </div>
  </body>
</html>
"""

    parsed = parse_mandoc_html(html)

    assert parsed.doc.blocks[0].type == "code_block"
    assert parsed.doc.blocks[0].text == "first line\nsecond line"
    assert "\\n" not in parsed.doc.blocks[0].text


def test_parse_mandoc_html_bullet_definition_lists_preserve_complex_items() -> None:
    html = """<!doctype html>
<html>
  <body>
    <div class="manual-text">
      <dl class="Bl-tag">
        <dt><b>*</b> </dt>
        <dd>marker-only term with <i>formatted prose</i></dd>
        <dt>* Leading break artifact</dt>
        <dd><pre><br>single-line continuation</pre></dd>
        <dt>* Multiline example</dt>
        <dd><pre>first line
second line</pre></dd>
        <dt>* Structured body</dt>
        <dd><p>explanation</p><pre>command --flag
continued</pre></dd>
      </dl>
    </div>
  </body>
</html>
"""

    parsed = parse_mandoc_html(html)

    bullet_list = parsed.doc.blocks[0]
    assert bullet_list.type == "list"
    assert [[block.type for block in item] for item in bullet_list.items] == [
        ["paragraph"],
        ["paragraph"],
        ["paragraph", "code_block"],
        ["paragraph", "paragraph", "code_block"],
    ]
    marker_only = bullet_list.items[0][0]
    assert [inline.type for inline in marker_only.inlines] == ["text", "emphasis"]
    assert marker_only.inlines[0].text == "marker-only term with "
    assert marker_only.inlines[1].inlines[0].text == "formatted prose"
    assert bullet_list.items[1][0].inlines[0].text == (
        "Leading break artifact single-line continuation"
    )
    assert bullet_list.items[2][1].text == "first line\nsecond line"
    assert bullet_list.items[3][1].inlines[0].text == "explanation"
    assert bullet_list.items[3][2].text == "command --flag\ncontinued"


def test_parse_mandoc_html_mixed_definition_list_is_not_reclassified() -> None:
    html = """<!doctype html>
<html>
  <body>
    <div class="manual-text">
      <dl class="Bl-tag">
        <dt>* bullet-shaped term</dt>
        <dd>first definition</dd>
        <dt>ordinary term</dt>
        <dd>second definition</dd>
      </dl>
    </div>
  </body>
</html>
"""

    parsed = parse_mandoc_html(html)

    definition_list = parsed.doc.blocks[0]
    assert definition_list.type == "definition_list"
    assert len(definition_list.items) == 2
    assert definition_list.items[0].termInlines[0].text == "* bullet-shaped term"
    assert parsed.options is None


def test_parse_mandoc_html_does_not_invent_spacing_around_formatted_markers() -> None:
    html = """<!doctype html>
<html>
  <body>
    <div class="manual-text">
      <dl class="Bl-tag">
        <dt><b>*</b>item without a separator</dt>
        <dd>definition</dd>
      </dl>
      <dl class="Bl-tag">
        <dt><b>*</b> <i>formatted item</i></dt>
        <dd>definition</dd>
      </dl>
    </div>
  </body>
</html>
"""

    parsed = parse_mandoc_html(html)

    definition_list, bullet_list = parsed.doc.blocks
    assert definition_list.type == "definition_list"
    assert definition_list.items[0].termInlines[0].inlines[0].text == "*"
    assert definition_list.items[0].termInlines[1].text == "item without a separator"
    assert bullet_list.type == "list"
    assert [inline.type for inline in bullet_list.items[0][0].inlines] == [
        "emphasis",
        "text",
    ]
    assert bullet_list.items[0][0].inlines[0].inlines[0].text == "formatted item"
    assert bullet_list.items[0][0].inlines[1].text == " definition"


def test_parse_mandoc_html_recognizes_ascii_dash_bullets_without_capturing_options() -> None:
    html = """<!doctype html>
<html>
  <body>
    <div class="manual-text">
      <dl class="Bl-tag">
        <dt>- first item</dt><dd>first continuation</dd>
        <dt>- second item</dt><dd>second continuation</dd>
      </dl>
      <dl class="Bl-tag">
        <dt>-a</dt><dd>include hidden files</dd>
        <dt>--all</dt><dd>include every file</dd>
        <dt>+O</dt><dd>disable a shell option</dd>
        <dt>command -x</dt><dd>example invocation, not an option term</dd>
      </dl>
    </div>
  </body>
</html>
"""

    parsed = parse_mandoc_html(html)

    assert [block.type for block in parsed.doc.blocks] == ["list", "definition_list"]
    assert parsed.doc.blocks[0].items[0][0].inlines[0].text == ("first item first continuation")
    assert parsed.doc.blocks[1].items[0].termInlines[0].text == "-a"
    assert parsed.options is not None
    assert [option.flags for option in parsed.options] == ["-a", "--all", "+O"]


def test_parse_mandoc_html_scopes_derived_options_to_options_sections() -> None:
    html = """<!doctype html>
<html>
  <body>
    <div class="manual-text">
      <section><h1 id="DESCRIPTION">DESCRIPTION</h1>
        <dl><dt>term</dt><dd>ordinary definition</dd></dl>
      </section>
      <section><h1 id="OPTIONS">OPTIONS</h1>
        <dl><dt>-a, --all</dt><dd>include every item</dd></dl>
        <dl><dt>+O [shopt_option]</dt><dd>disable a shell option</dd></dl>
      </section>
      <section><h1 id="NOTES">NOTES</h1>
        <dl><dt>-x</dt><dd>not an option in this context</dd></dl>
      </section>
    </div>
  </body>
</html>
"""

    parsed = parse_mandoc_html(html)

    assert parsed.options is not None
    assert [(option.flags, option.description) for option in parsed.options] == [
        ("-a, --all", "include every item"),
        ("+O [shopt_option]", "disable a shell option"),
    ]
