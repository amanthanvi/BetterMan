#!/usr/bin/env python3
"""
Comprehensive management CLI for BetterMan man page loading.
Provides commands for loading, monitoring, and managing man pages.
"""

import asyncio
import click
import json
import time
from typing import Optional, List
from datetime import datetime, timedelta
from tabulate import tabulate
from rich.console import Console
from rich.progress import (
    Progress,
    SpinnerColumn,
    TextColumn,
    BarColumn,
    TaskProgressColumn,
)
from rich.table import Table
from rich.live import Live
from rich.panel import Panel
from rich.text import Text
import sys
import os

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from src.parser.comprehensive_loader import ComprehensiveBatchLoader
from src.parser.comprehensive_discovery import ComprehensiveManPageDiscovery
from src.db.session import get_db, init_db
from src.models.document import Document
from sqlalchemy import func, select
from sqlalchemy.orm import Session

console = Console()


@click.group()
def cli():
    """BetterMan comprehensive man page management CLI."""
    pass


@cli.command()
@click.option(
    "--priority-min", type=int, default=1, help="Minimum priority level (1-8)"
)
@click.option(
    "--priority-max", type=int, default=8, help="Maximum priority level (1-8)"
)
@click.option("--sections", help="Comma-separated list of sections (e.g., 1,2,3,8)")
@click.option("--batch-size", type=int, default=100, help="Pages per batch")
@click.option("--max-workers", type=int, help="Maximum worker threads")
@click.option("--memory-limit", type=int, default=2048, help="Memory limit in MB")
@click.option("--resume", help="Resume from session ID")
@click.option(
    "--dry-run", is_flag=True, help="Show what would be loaded without loading"
)
@click.option("--no-cache", is_flag=True, help="Disable caching")
@click.option("--quiet", is_flag=True, help="Minimal output")
def load(
    priority_min: int,
    priority_max: int,
    sections: Optional[str],
    batch_size: int,
    max_workers: Optional[int],
    memory_limit: int,
    resume: Optional[str],
    dry_run: bool,
    no_cache: bool,
    quiet: bool,
):
    """Load ALL Linux man pages comprehensively."""

    async def run_loading():
        # Initialize database
        await init_db()

        # Parse sections
        sections_filter = None
        if sections:
            sections_filter = [s.strip() for s in sections.split(",")]

        # Priority range
        priority_range = None
        if priority_min != 1 or priority_max != 8:
            priority_range = (priority_min, priority_max)

        # Create loader
        loader = ComprehensiveBatchLoader(
            batch_size=batch_size,
            max_workers=max_workers,
            memory_limit_mb=memory_limit,
            enable_caching=not no_cache,
        )

        if dry_run:
            # Dry run mode
            console.print("\n[bold yellow]🔍 DRY RUN MODE[/bold yellow]")
            console.print("Discovering available man pages...\n")

            with console.status("[bold green]Discovering man pages...") as status:
                async for update in loader.load_all_man_pages(
                    priority_range=priority_range,
                    sections_filter=sections_filter,
                    dry_run=True,
                ):
                    if update["type"] == "dry_run":
                        # Display dry run results
                        total = update["total_pages"]
                        sections_count = update["sections"]

                        console.print(
                            f"\n[bold]Would process {total:,} man pages across {sections_count} sections[/bold]\n"
                        )

                        # Create breakdown table
                        table = Table(title="Man Pages by Section")
                        table.add_column("Section", style="cyan", width=10)
                        table.add_column("Count", style="magenta", justify="right")
                        table.add_column("Description", style="green")

                        section_descriptions = {
                            "1": "User commands",
                            "2": "System calls",
                            "3": "Library functions",
                            "4": "Device files",
                            "5": "File formats",
                            "6": "Games",
                            "7": "Miscellaneous",
                            "8": "System administration",
                            "n": "New/Tcl commands",
                            "l": "Local commands",
                        }

                        for section in sorted(update["breakdown"].keys()):
                            count = update["breakdown"][section]
                            desc = section_descriptions.get(section[0], "Other")
                            table.add_row(section, f"{count:,}", desc)

                        console.print(table)
            return

        # Actual loading
        console.print(
            f"\n[bold green]🚀 Starting comprehensive man page loading[/bold green]"
        )
        console.print(
            f"Configuration: batch_size={batch_size}, max_workers={max_workers or 'auto'}, memory_limit={memory_limit}MB\n"
        )

        start_time = time.time()

        # Progress tracking
        overall_progress = Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
            console=console,
            transient=False,
        )

        with overall_progress:
            overall_task = overall_progress.add_task(
                "[cyan]Overall progress", total=100
            )

            current_stats = {
                "processed": 0,
                "total": 0,
                "success": 0,
                "errors": 0,
                "current_section": "",
                "eta": None,
            }

            try:
                async for update in loader.load_all_man_pages(
                    priority_range=priority_range,
                    sections_filter=sections_filter,
                    resume_session=resume,
                ):
                    if update["type"] == "progress":
                        # Update statistics
                        overall = update["overall_progress"]
                        current_stats["processed"] = overall["processed"]
                        current_stats["total"] = overall["total"]
                        current_stats["current_section"] = update["section"]

                        # Update progress bar
                        overall_progress.update(
                            overall_task,
                            completed=overall["percentage"],
                            description=f"[cyan]Processing section {update['section']} - {overall['processed']:,}/{overall['total']:,} pages",
                        )

                        # Show batch errors if any
                        if not quiet and update["batch"].get("errors", 0) > 0:
                            console.print(
                                f"[yellow]⚠️  Batch errors: {update['batch']['errors']}[/yellow]"
                            )

                        # Update ETA
                        if overall.get("eta_seconds"):
                            eta_min = overall["eta_seconds"] / 60
                            current_stats["eta"] = f"{eta_min:.1f}m"

                    elif update["type"] == "completion":
                        # Show completion statistics
                        session = update["session"]
                        duration = session["duration"] / 60  # Convert to minutes

                        console.print(
                            "\n[bold green]✅ Loading completed successfully![/bold green]\n"
                        )

                        # Summary table
                        summary = Table(title="Loading Summary", show_header=False)
                        summary.add_column("Metric", style="cyan")
                        summary.add_column("Value", style="green", justify="right")

                        summary.add_row(
                            "Total Pages", f"{session['pages_processed']:,}"
                        )
                        summary.add_row("Successful", f"{session['pages_success']:,}")
                        summary.add_row("Errors", f"{session['pages_error']:,}")
                        summary.add_row("Skipped", f"{session['pages_skipped']:,}")
                        summary.add_row(
                            "Success Rate", f"{session['success_rate']:.1f}%"
                        )
                        summary.add_row("Duration", f"{duration:.1f} minutes")
                        summary.add_row(
                            "Pages/Second",
                            f"{session['pages_processed']/session['duration']:.1f}",
                        )

                        console.print(summary)

                        # Show sections completed
                        if session.get("sections_completed"):
                            console.print(
                                f"\n[bold]Sections completed:[/bold] {', '.join(session['sections_completed'])}"
                            )

            except KeyboardInterrupt:
                console.print("\n[bold red]⏹️  Loading interrupted by user[/bold red]")
                console.print(
                    "[yellow]💡 Use --resume with the session ID to continue later[/yellow]"
                )
            except Exception as e:
                console.print(f"\n[bold red]❌ Error during loading: {e}[/bold red]")
                raise

    # Run the async function
    asyncio.run(run_loading())


@cli.command()
@click.option("--section", help="Show stats for specific section")
@click.option("--category", help="Show stats for specific category")
@click.option("--detailed", is_flag=True, help="Show detailed breakdown")
@click.option("--export", help="Export stats to JSON file")
def stats(
    section: Optional[str],
    category: Optional[str],
    detailed: bool,
    export: Optional[str],
):
    """Show comprehensive database statistics."""

    # Initialize database
    try:
        db = next(get_db())
    except StopIteration:
        console.print("[red]❌ Failed to initialize database connection[/red]")
        return

    try:
        if section:
            # Section-specific stats
            count = (
                db.query(func.count(Document.id))
                .filter(Document.section == section)
                .scalar()
            )
            console.print(f"\n[bold]Section {section}:[/bold] {count:,} documents\n")

            if detailed:
                # Category breakdown for section
                categories = (
                    db.query(Document.category, func.count(Document.id).label("count"))
                    .filter(Document.section == section)
                    .group_by(Document.category)
                    .all()
                )

                if categories:
                    table = Table(title=f"Categories in Section {section}")
                    table.add_column("Category", style="cyan")
                    table.add_column("Count", style="magenta", justify="right")

                    for cat, cnt in sorted(
                        categories, key=lambda x: x[1], reverse=True
                    ):
                        table.add_row(cat or "uncategorized", f"{cnt:,}")

                    console.print(table)

        elif category:
            # Category-specific stats
            count = (
                db.query(func.count(Document.id))
                .filter(Document.category == category)
                .scalar()
            )
            console.print(f"\n[bold]Category {category}:[/bold] {count:,} documents\n")

            if detailed:
                # Section breakdown for category
                sections = (
                    db.query(Document.section, func.count(Document.id).label("count"))
                    .filter(Document.category == category)
                    .group_by(Document.section)
                    .all()
                )

                if sections:
                    table = Table(title=f"Sections in Category {category}")
                    table.add_column("Section", style="cyan")
                    table.add_column("Count", style="magenta", justify="right")

                    for sec, cnt in sorted(sections):
                        table.add_row(sec, f"{cnt:,}")

                    console.print(table)

        else:
            # Overall statistics
            total = db.query(func.count(Document.id)).scalar()
            console.print(f"\n[bold green]📚 Total documents: {total:,}[/bold green]\n")

            # Section breakdown
            sections = (
                db.query(Document.section, func.count(Document.id).label("count"))
                .group_by(Document.section)
                .order_by(Document.section)
                .all()
            )

            if sections:
                section_table = Table(title="Documents by Section")
                section_table.add_column("Section", style="cyan", width=10)
                section_table.add_column("Count", style="magenta", justify="right")
                section_table.add_column("Percentage", style="green", justify="right")

                for sec, cnt in sections:
                    percentage = (cnt / total * 100) if total > 0 else 0
                    section_table.add_row(sec, f"{cnt:,}", f"{percentage:.1f}%")

                console.print(section_table)

            if detailed:
                # Category breakdown
                console.print("")
                categories = (
                    db.query(Document.category, func.count(Document.id).label("count"))
                    .group_by(Document.category)
                    .order_by(func.count(Document.id).desc())
                    .limit(20)
                    .all()
                )

                if categories:
                    category_table = Table(title="Top 20 Categories")
                    category_table.add_column("Category", style="cyan")
                    category_table.add_column("Count", style="magenta", justify="right")
                    category_table.add_column(
                        "Percentage", style="green", justify="right"
                    )

                    for cat, cnt in categories:
                        percentage = (cnt / total * 100) if total > 0 else 0
                        category_table.add_row(
                            cat or "uncategorized", f"{cnt:,}", f"{percentage:.1f}%"
                        )

                    console.print(category_table)

                # Size statistics
                console.print("")
                size_stats = db.query(
                    func.sum(func.length(Document.raw_content)).label("total_size"),
                    func.avg(func.length(Document.raw_content)).label("avg_size"),
                    func.max(func.length(Document.raw_content)).label("max_size"),
                ).first()

                if size_stats and size_stats.total_size:
                    size_table = Table(title="Content Size Statistics")
                    size_table.add_column("Metric", style="cyan")
                    size_table.add_column("Value", style="green", justify="right")

                    size_table.add_row(
                        "Total Size", f"{size_stats.total_size / (1024*1024):.1f} MB"
                    )
                    size_table.add_row(
                        "Average Size", f"{size_stats.avg_size / 1024:.1f} KB"
                    )
                    size_table.add_row(
                        "Largest Page", f"{size_stats.max_size / 1024:.1f} KB"
                    )

                    console.print(size_table)

        # Export if requested
        if export:
            stats_data = {
                "timestamp": datetime.now().isoformat(),
                "total_documents": total if "total" in locals() else 0,
                "sections": (
                    {sec: cnt for sec, cnt in sections}
                    if "sections" in locals()
                    else {}
                ),
                "categories": (
                    {cat: cnt for cat, cnt in categories}
                    if "categories" in locals() and detailed
                    else {}
                ),
            }

            with open(export, "w") as f:
                json.dump(stats_data, f, indent=2)

            console.print(f"\n[green]✅ Stats exported to {export}[/green]")

    finally:
        db.close()


@cli.command()
@click.argument("command")
@click.option("--section", help="Specific section (default: any)")
@click.option("--force", is_flag=True, help="Force reload even if exists")
def reload(command: str, section: Optional[str], force: bool):
    """Reload a specific man page."""

    async def run_reload():
        await init_db()

        console.print(f"\n[bold]Reloading man page: {command}[/bold]")
        if section:
            console.print(f"Section: {section}")

        # Create discovery instance
        discovery = ComprehensiveManPageDiscovery()

        with console.status("[bold green]Searching for man page...") as status:
            # Discover all man paths
            man_paths = discovery.discover_all_man_paths()

            # Search for the specific command
            found_pages = []

            for path in man_paths:
                # Check each section directory
                for item in os.listdir(path):
                    if not item.startswith("man"):
                        continue

                    section_dir = os.path.join(path, item)
                    if not os.path.isdir(section_dir):
                        continue

                    # Look for files matching the command
                    for filename in os.listdir(section_dir):
                        if filename.startswith(command):
                            # Extract section from directory name
                            dir_section = item[3:]  # Remove 'man' prefix

                            # Check if section matches filter
                            if section and dir_section != section:
                                continue

                            file_path = os.path.join(section_dir, filename)
                            page_info = discovery._extract_comprehensive_page_info(
                                filename, section_dir, dir_section, path
                            )

                            if page_info and page_info["command"] == command:
                                found_pages.append(page_info)

        if not found_pages:
            console.print(f"[red]❌ Man page '{command}' not found[/red]")
            return

        # Show found pages
        if len(found_pages) > 1:
            console.print(f"\n[yellow]Found {len(found_pages)} versions:[/yellow]")
            for i, page in enumerate(found_pages):
                console.print(
                    f"  {i+1}. {page['command']} (section {page['section']}) - {page['base_path']}"
                )

            if not force:
                console.print("\n[yellow]Use --force to reload all versions[/yellow]")
                return

        # Create loader
        loader = ComprehensiveBatchLoader(batch_size=10)

        # Process each found page
        for page_info in found_pages:
            console.print(
                f"\n[bold]Processing: {page_info['command']} (section {page_info['section']})[/bold]"
            )

            result = await loader._process_single_page(page_info)

            if result["status"] == "success":
                console.print(f"[green]✅ Successfully loaded[/green]")
            elif result["status"] == "skipped":
                console.print(
                    f"[yellow]⏭️  Skipped: {result.get('reason', 'unknown')}[/yellow]"
                )
                if not force:
                    console.print("[yellow]Use --force to reload anyway[/yellow]")
            else:
                console.print(f"[red]❌ Error: {result.get('error', 'unknown')}[/red]")

    asyncio.run(run_reload())


@cli.command()
def discover():
    """Discover all available man pages without loading them."""

    console.print("\n[bold]🔍 Discovering all man pages on the system...[/bold]\n")

    discovery = ComprehensiveManPageDiscovery()

    with console.status("[bold green]Discovering man directories...") as status:
        man_paths = discovery.discover_all_man_paths()

    console.print(f"[green]✅ Found {len(man_paths)} man directories[/green]\n")

    # Show paths
    path_table = Table(title="Man Page Directories")
    path_table.add_column("Path", style="cyan")
    path_table.add_column("Type", style="green")

    for path in sorted(man_paths):
        path_type = "standard"
        if "/usr/local" in path:
            path_type = "local"
        elif "/opt" in path:
            path_type = "optional"
        elif "X11" in path:
            path_type = "X11"

        path_table.add_row(path, path_type)

    console.print(path_table)

    # Discover all pages
    console.print("\n[bold]Discovering all man pages...[/bold]")

    with Progress(console=console) as progress:
        task = progress.add_task("[cyan]Scanning directories...", total=None)

        all_pages = discovery.discover_all_pages()

    # Show summary
    total_pages = sum(len(pages) for pages in all_pages.values())

    console.print(f"\n[bold green]📚 Discovery complete![/bold green]")
    console.print(f"Total man pages found: {total_pages:,}\n")

    # Section summary
    section_summary = Table(title="Man Pages by Section")
    section_summary.add_column("Section", style="cyan")
    section_summary.add_column("Count", style="magenta", justify="right")
    section_summary.add_column("Priority Distribution", style="green")

    for section in sorted(all_pages.keys()):
        pages = all_pages[section]

        # Count by priority
        priority_counts = {}
        for page in pages:
            p = page["priority"]
            priority_counts[p] = priority_counts.get(p, 0) + 1

        priority_str = ", ".join(
            f"P{p}:{c}" for p, c in sorted(priority_counts.items())
        )
        section_summary.add_row(section, f"{len(pages):,}", priority_str)

    console.print(section_summary)


@cli.command()
@click.option(
    "--format",
    type=click.Choice(["json", "csv", "text"]),
    default="text",
    help="Export format",
)
@click.option("--output", required=True, help="Output file path")
@click.option("--section", help="Export only specific section")
def export(format: str, output: str, section: Optional[str]):
    """Export man page metadata."""

    try:
        db = next(get_db())
    except StopIteration:
        console.print("[red]❌ Failed to initialize database connection[/red]")
        return

    try:
        # Query documents
        query = db.query(Document)
        if section:
            query = query.filter(Document.section == section)

        documents = query.all()

        console.print(
            f"\n[bold]Exporting {len(documents)} documents to {output}...[/bold]"
        )

        if format == "json":
            # Export as JSON
            data = []
            for doc in documents:
                data.append(
                    {
                        "name": doc.name,
                        "section": doc.section,
                        "title": doc.title,
                        "category": doc.category,
                        "tags": doc.tags,
                        "created_at": (
                            doc.created_at.isoformat() if doc.created_at else None
                        ),
                        "updated_at": (
                            doc.updated_at.isoformat() if doc.updated_at else None
                        ),
                    }
                )

            with open(output, "w") as f:
                json.dump(data, f, indent=2)

        elif format == "csv":
            # Export as CSV
            import csv

            with open(output, "w", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(["name", "section", "title", "category", "tags"])

                for doc in documents:
                    writer.writerow(
                        [doc.name, doc.section, doc.title, doc.category, doc.tags]
                    )

        else:  # text
            # Export as text listing
            with open(output, "w") as f:
                for doc in documents:
                    f.write(f"{doc.name}({doc.section}) - {doc.title}\n")

        console.print(f"[green]✅ Exported to {output}[/green]")

    finally:
        db.close()


@cli.command()
def cleanup():
    """Clean up duplicate or invalid entries."""

    console.print(
        "\n[bold yellow]⚠️  This will remove duplicate man page entries[/bold yellow]"
    )

    if not click.confirm("Continue?"):
        return

    try:
        db = next(get_db())
    except StopIteration:
        console.print("[red]❌ Failed to initialize database connection[/red]")
        return

    try:
        # Find duplicates
        duplicates = (
            db.query(
                Document.name, Document.section, func.count(Document.id).label("count")
            )
            .group_by(Document.name, Document.section)
            .having(func.count(Document.id) > 1)
            .all()
        )

        if not duplicates:
            console.print("[green]✅ No duplicates found[/green]")
            return

        console.print(f"\n[yellow]Found {len(duplicates)} duplicate entries[/yellow]")

        removed_count = 0

        with Progress(console=console) as progress:
            task = progress.add_task(
                "[cyan]Removing duplicates...", total=len(duplicates)
            )

            for name, section, count in duplicates:
                # Keep the most recent one
                docs = (
                    db.query(Document)
                    .filter(Document.name == name, Document.section == section)
                    .order_by(Document.updated_at.desc())
                    .all()
                )

                # Delete all but the first (most recent)
                for doc in docs[1:]:
                    db.delete(doc)
                    removed_count += 1

                progress.update(task, advance=1)

        db.commit()
        console.print(f"\n[green]✅ Removed {removed_count} duplicate entries[/green]")

    finally:
        db.close()


if __name__ == "__main__":
    cli()
