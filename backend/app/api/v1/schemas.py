from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, RootModel


class ErrorDetail(BaseModel):
    code: str
    message: str


class ApiErrorEnvelope(BaseModel):
    error: ErrorDetail


class InfoResponse(BaseModel):
    datasetReleaseId: str
    locale: str
    distro: str
    pageCount: int
    lastUpdated: str


class SearchResult(BaseModel):
    name: str
    section: str
    title: str
    description: str
    highlights: list[str]


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]
    suggestions: list[str]


class Suggestion(BaseModel):
    name: str
    section: str
    description: str


class SuggestResponse(BaseModel):
    query: str
    suggestions: list[Suggestion]


class SectionLabel(BaseModel):
    section: str
    label: str


class SectionPage(BaseModel):
    name: str
    section: str
    title: str
    description: str


class SectionResponse(BaseModel):
    section: str
    label: str
    limit: int
    offset: int
    total: int
    results: list[SectionPage]


class LicensePackage(BaseModel):
    name: str
    version: str
    hasLicenseText: bool


class LicensesResponse(BaseModel):
    datasetReleaseId: str
    ingestedAt: str
    imageRef: str
    imageDigest: str
    packageManifest: dict | None
    packages: list[LicensePackage]


class LicenseTextResponse(BaseModel):
    package: str
    licenseId: str
    licenseName: str
    text: str


class TocItem(BaseModel):
    id: str
    title: str
    level: int


class TextInline(BaseModel):
    type: Literal["text"]
    text: str


class CodeInline(BaseModel):
    type: Literal["code"]
    text: str


class EmphasisInline(BaseModel):
    type: Literal["emphasis"]
    inlines: list[InlineNode]


class StrongInline(BaseModel):
    type: Literal["strong"]
    inlines: list[InlineNode]


class LinkInline(BaseModel):
    type: Literal["link"]
    href: str
    inlines: list[InlineNode]
    linkType: Literal["internal", "external", "unresolved"]


class InlineNode(
    RootModel[
        Annotated[
            TextInline | CodeInline | EmphasisInline | StrongInline | LinkInline,
            Field(discriminator="type"),
        ]
    ]
):
    pass


class HeadingBlock(BaseModel):
    type: Literal["heading"]
    id: str
    level: int
    text: str


class ParagraphBlock(BaseModel):
    type: Literal["paragraph"]
    inlines: list[InlineNode]


class ListBlock(BaseModel):
    type: Literal["list"]
    ordered: bool
    items: list[list[BlockNode]]


class DefinitionListItem(BaseModel):
    id: str | None = None
    termInlines: list[InlineNode]
    definitionBlocks: list[BlockNode]


class DefinitionListBlock(BaseModel):
    type: Literal["definition_list"]
    items: list[DefinitionListItem]


class CodeBlock(BaseModel):
    type: Literal["code_block"]
    text: str
    languageHint: str | None = None
    id: str | None = None


class TableBlock(BaseModel):
    type: Literal["table"]
    headers: list[str]
    rows: list[list[str]]


class HorizontalRuleBlock(BaseModel):
    type: Literal["horizontal_rule"]


class BlockNode(
    RootModel[
        Annotated[
            HeadingBlock
            | ParagraphBlock
            | ListBlock
            | DefinitionListBlock
            | CodeBlock
            | TableBlock
            | HorizontalRuleBlock,
            Field(discriminator="type"),
        ]
    ]
):
    pass


EmphasisInline.model_rebuild()
StrongInline.model_rebuild()
LinkInline.model_rebuild()
InlineNode.model_rebuild()

ListBlock.model_rebuild()
DefinitionListItem.model_rebuild()
DefinitionListBlock.model_rebuild()
BlockNode.model_rebuild()


class DocumentModel(BaseModel):
    toc: list[TocItem]
    blocks: list[BlockNode]


class OptionItem(BaseModel):
    flags: str
    argument: str | None = None
    description: str
    anchorId: str


class SeeAlsoRef(BaseModel):
    name: str
    section: str | None = None
    resolvedPageId: str | None = None


class ManPage(BaseModel):
    id: str
    locale: str
    distro: str
    name: str
    section: str
    title: str
    description: str
    sourcePackage: str | None = None
    sourcePackageVersion: str | None = None
    datasetReleaseId: str


class ManPageContent(DocumentModel):
    synopsis: list[str] | None = None
    options: list[OptionItem] | None = None
    seeAlso: list[SeeAlsoRef] | None = None


class ManPageVariant(BaseModel):
    distro: str
    datasetReleaseId: str
    contentSha256: str


class ManPageResponse(BaseModel):
    page: ManPage
    content: ManPageContent
    variants: list[ManPageVariant]


class AmbiguousOption(BaseModel):
    section: str
    title: str
    description: str


class AmbiguousPageResponse(ApiErrorEnvelope):
    options: list[AmbiguousOption]


class RelatedResponse(BaseModel):
    items: list[SectionPage]
