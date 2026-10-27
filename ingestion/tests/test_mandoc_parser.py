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


def test_parse_mandoc_html_includes_flag_definitions_outside_options_sections() -> None:
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
        <dl><dt>-x</dt><dd>extract an archive</dd></dl>
      </section>
    </div>
  </body>
</html>
"""

    parsed = parse_mandoc_html(html)

    assert parsed.options is not None
    assert [(option.flags, option.argument, option.description) for option in parsed.options] == [
        ("-a, --all", None, "include every item"),
        ("+O", "[shopt_option]", "disable a shell option"),
        ("-x", None, "extract an archive"),
    ]


def test_nested_options_keep_body_ids_and_exclude_dash_prose() -> None:
    parsed = parse_mandoc_html("""<div class="manual-text">
      <h1>OPTIONS</h1><div class="Bd-indent"><dl>
        <dt id="all">-a, --all</dt><dd>All entries.
          <dl><dt id="nested">--nested</dt><dd>Nested flag.</dd></dl>
        </dd></dl></div>
      <h1>NOTES</h1><dl>
        <dt>- first observation</dt><dd>Prose starting with a dash.</dd>
        <dt>ordinary term</dt><dd>Not a flag.</dd>
      </dl></div>""")
    assert parsed.options is not None
    assert [(o.flags, o.anchorId) for o in parsed.options] == [
        ("-a, --all", "all"),
        ("--nested", "nested"),
    ]
    outer = parsed.doc.blocks[1].items[0][0].items[0]
    assert outer.id == "all"
    assert outer.definitionBlocks[0].items[0].id == "nested"


def test_docbook_option_paragraphs_become_anchored_definitions() -> None:
    parsed = parse_mandoc_html("""<!-- Generator: DocBook XSL Stylesheets -->
      <div class="manual-text">
      <h1>OPTIONS</h1><p class="Pp">-a, --all</p>
      <div class="Bd-indent">Stage all changes.<p>Keep this paragraph.</p></div>
      <p class="Pp">- first observation</p><div class="Bd-indent">Prose.</div>
      <dl><dt id="original">--original</dt><dd>Original definition.</dd></dl>
      </div>""")
    assert parsed.options
    assert [o.flags for o in parsed.options] == ["-a, --all", "--original"]
    assert "Stage all changes." in parsed.options[0].description
    assert "Keep this paragraph." in parsed.options[0].description
    assert parsed.options[1].anchorId == "original"


def test_nested_options_exclude_mixed_dash_prose() -> None:
    parsed = parse_mandoc_html("""<div class="manual-text"><h1>OPTIONS</h1>
      <div class="Bd-indent"><dl>
        <dt>-a</dt><dd>All entries.</dd>
        <dt>- first observation</dt><dd>Prose, not a flag.</dd>
      </dl></div></div>""")
    assert parsed.options and [option.flags for option in parsed.options] == ["-a"]


def test_converted_option_cannot_claim_an_existing_body_id() -> None:
    parsed = parse_mandoc_html("""<!-- Generator: DocBook XSL Stylesheets -->
      <div class="manual-text"><h1>OPTIONS</h1>
      <p class="Pp">-a</p><div class="Bd-indent">New definition.</div>
      <dl><dt id="def-a">--existing</dt><dd>Existing explicit ID.</dd>
        <dt>-b</dt><dd>Existing generated ID.</dd></dl>
      <p class="Pp">-b</p><div class="Bd-indent">Another new definition.</div>
      </div>""")
    assert parsed.options
    assert [(option.flags, option.anchorId) for option in parsed.options] == [
        ("-a", "def-a-2"),
        ("--existing", "def-a"),
        ("-b", "def-b"),
        ("-b", "def-b-2"),
    ]


def test_docbook_word_in_prose_does_not_authorize_paragraph_conversion() -> None:
    parsed = parse_mandoc_html("""<div class="manual-text"><h1>OPTIONS</h1>
      <p class="Pp">-T sets the key table, even in a DocBook viewer.</p>
      <div class="Bd-indent"><pre>bind-key -Troot a list-keys</pre></div>
      </div>""")
    assert parsed.options is None
    assert parsed.doc.blocks[1].type == "paragraph"
    assert parsed.doc.blocks[2].type == "list"


def test_nested_values_are_not_options_but_nested_flags_keep_their_ids() -> None:
    parsed = parse_mandoc_html("""<div class="manual-text"><h1>OPTIONS</h1>
      <dl><dt id="format">--format=FORMAT</dt><dd><dl>
        <dt id="gnu">gnu</dt><dd>GNU format.</dd>
        <dt id="nested">-x</dt><dd>Extract.</dd>
        <dt id="env">TAR_FORMAT</dt><dd>Current format.</dd>
      </dl></dd></dl></div>""")
    assert parsed.options
    assert [(o.flags, o.anchorId) for o in parsed.options] == [
        ("--format", "format"),
        ("-x", "nested"),
    ]
    values = parsed.doc.blocks[1].items[0].definitionBlocks[0].items
    assert [item.id for item in values] == ["gnu", "nested", "env"]


def test_conditional_operators_stay_in_body_and_real_command_flags_stay_indexed() -> None:
    parsed = parse_mandoc_html("""<div class="manual-text">
      <h1>OPTIONS</h1><dl><dt id="real-a">-a</dt><dd>Shell flag.</dd></dl>
      <h1>CONDITIONAL EXPRESSIONS</h1><dl>
        <dt id="test-a">-a file</dt><dd>File exists.</dd>
        <dt id="test-z">-z string</dt><dd>String is empty.</dd>
      </dl><h1>BUILTINS</h1><dl>
        <dt id="real-z">-z</dt><dd>Real builtin flag.</dd>
      </dl></div>""")
    assert parsed.options
    assert [(o.flags, o.anchorId) for o in parsed.options] == [("-a", "real-a"), ("-z", "real-z")]
    assert [item.id for item in parsed.doc.blocks[3].items] == ["test-a", "test-z"]


def test_option_shapes_reject_ranges_prose_and_operators_without_changing_body_ids() -> None:
    parsed = parse_mandoc_html("""<div class="manual-text"><h1>OPTIONS</h1>
      <dl><dt id="real">--real</dt><dd><dl>
        <dt id="range">(-1, 2)</dt><dd>Numeric interval.</dd>
        <dt id="prose">-&lt;The address of a label is taken&gt;</dt><dd>Prose.</dd>
        <dt id="digit">-&lt;digit&gt;</dt><dd>Symbolic flag.</dd>
        <dt id="less">-&lt;, --less-than</dt><dd>Literal punctuation flag.</dd>
        <dt id="slash">-/</dt><dd>Punctuation flag.</dd>
        <dt id="caret">-^</dt><dd>Punctuation flag.</dd>
        <dt id="group">--(heading|footing)-(left|right)</dt><dd>Grouped flag.</dd>
      </dl></dd></dl><h1>Operators</h1><dl>
        <dt id="increment">++ --</dt><dd>Increment and decrement.</dd>
        <dt id="pattern">+(pattern-list)</dt><dd>Shell globbing.</dd>
        <dt id="all">-a</dt><dd>Real flag.</dd>
      </dl></div>""")
    assert parsed.options
    assert [option.anchorId for option in parsed.options] == [
        "real",
        "digit",
        "less",
        "slash",
        "caret",
        "group",
        "all",
    ]
    nested = parsed.doc.blocks[1].items[0].definitionBlocks[0]
    assert [item.id for item in nested.items] == [
        "range",
        "prose",
        "digit",
        "less",
        "slash",
        "caret",
        "group",
    ]
    assert [item.id for item in parsed.doc.blocks[3].items] == ["increment", "pattern", "all"]


def test_mdoc_command_markup_needs_option_context_for_bare_tokens() -> None:
    parsed = parse_mandoc_html("""<div class="manual-text"><h1>DESCRIPTION</h1>
      <dl><dt id="hash"><code class="Cm">#</code></dt><dd>Alternate format.</dd>
        <dt id="left"><code class="Cm">-</code></dt><dd>Left-adjust.</dd>
        <dt id="plus"><code class="Cm">+</code></dt><dd>Always show a sign.</dd>
      </dl><p class="Pp">The following options are available:</p>
      <dl><dt id="time">hhmm</dt><dd>Alarm time.</dd>
        <dt id="relative"><code class="Cm">+</code></dt><dd>Relative alarm time.</dd>
      </dl></div>""")
    assert parsed.options and [(o.flags, o.anchorId) for o in parsed.options] == [("+", "relative")]
    assert [item.id for item in parsed.doc.blocks[1].items] == ["hash", "left", "plus"]
