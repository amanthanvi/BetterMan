from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, HttpUrl


class TocItem(BaseModel):
    id: str
    title: str
    level: int = Field(ge=1, le=6)


class InlineText(BaseModel):
    type: Literal["text"] = "text"
    text: str


class InlineCode(BaseModel):
    type: Literal["code"] = "code"
    text: str


class InlineEmphasis(BaseModel):
    type: Literal["emphasis"] = "emphasis"
    inlines: list[InlineNode]


class InlineStrong(BaseModel):
    type: Literal["strong"] = "strong"
    inlines: list[InlineNode]


class InlineLink(BaseModel):
    type: Literal["link"] = "link"
    href: str
    inlines: list[InlineNode]
    linkType: Literal["internal", "external", "unresolved"]

    @staticmethod
    def _ensure_allowed_external(url: str) -> None:
        HttpUrl(url)

    @staticmethod
    def _ensure_allowed_internal(url: str) -> None:
        if not url.startswith("/"):
            raise ValueError("internal href must start with '/'")

    def model_post_init(self, __context: object) -> None:
        if self.linkType == "external":
            self._ensure_allowed_external(self.href)
        else:
            self._ensure_allowed_internal(self.href)


InlineNode = Annotated[
    InlineText | InlineCode | InlineEmphasis | InlineStrong | InlineLink,
    Field(discriminator="type"),
]


class BlockHeading(BaseModel):
    type: Literal["heading"] = "heading"
    id: str
    level: int = Field(ge=1, le=6)
    text: str


class BlockParagraph(BaseModel):
    type: Literal["paragraph"] = "paragraph"
    inlines: list[InlineNode]


class BlockList(BaseModel):
    type: Literal["list"] = "list"
    ordered: bool
    items: list[list[BlockNode]]


class DefinitionListItem(BaseModel):
    id: str | None = None
    termInlines: list[InlineNode]
    definitionBlocks: list[BlockNode]


class BlockDefinitionList(BaseModel):
    type: Literal["definition_list"] = "definition_list"
    items: list[DefinitionListItem]


class BlockCode(BaseModel):
    type: Literal["code_block"] = "code_block"
    text: str
    languageHint: str | None = None
    id: str | None = None


class BlockTable(BaseModel):
    type: Literal["table"] = "table"
    headers: list[str]
    rows: list[list[str]]


class BlockHorizontalRule(BaseModel):
    type: Literal["horizontal_rule"] = "horizontal_rule"


BlockNode = Annotated[
    BlockHeading
    | BlockParagraph
    | BlockList
    | BlockDefinitionList
    | BlockCode
    | BlockTable
    | BlockHorizontalRule,
    Field(discriminator="type"),
]


class OptionItem(BaseModel):
    flags: str
    argument: str | None = None
    description: str
    anchorId: str


class SeeAlsoRef(BaseModel):
    name: str
    section: str | None = None
    resolvedPageId: str | None = None


class DocumentModel(BaseModel):
    toc: list[TocItem]
    blocks: list[BlockNode]


# Required for forward references used in union models above.
InlineEmphasis.model_rebuild()
InlineStrong.model_rebuild()
InlineLink.model_rebuild()
BlockList.model_rebuild()
DefinitionListItem.model_rebuild()
BlockDefinitionList.model_rebuild()
DocumentModel.model_rebuild()
