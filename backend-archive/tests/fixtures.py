"""
Test fixtures for BetterMan tests
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from faker import Faker
from datetime import datetime, timedelta
import random

from src.db.session import Base
from src.models.document import ManPage, ManPageVersion, ManPageTag
from src.models.user import User, UserRole, UserFavorite
from src.auth.auth_service import AuthService

fake = Faker()


@pytest.fixture(scope="session")
def test_db():
    """Create test database"""
    engine = create_engine("sqlite:///./test.db")
    Base.metadata.create_all(bind=engine)
    
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    
    yield SessionLocal
    
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session(test_db):
    """Create a test database session"""
    session = test_db()
    yield session
    session.rollback()
    session.close()


@pytest.fixture
def sample_users(db_session):
    """Create sample users"""
    users = []
    
    # Admin user
    admin = User(
        username="admin",
        email="admin@example.com",
        role=UserRole.ADMIN,
        is_active=True
    )
    admin.set_password("AdminPass123!")
    users.append(admin)
    
    # Regular users
    for i in range(5):
        user = User(
            username=f"user{i}",
            email=f"user{i}@example.com",
            role=UserRole.USER,
            is_active=True
        )
        user.set_password("UserPass123!")
        users.append(user)
    
    # Premium user
    premium = User(
        username="premium",
        email="premium@example.com",
        role=UserRole.PREMIUM,
        is_active=True
    )
    premium.set_password("PremiumPass123!")
    users.append(premium)
    
    # Inactive user
    inactive = User(
        username="inactive",
        email="inactive@example.com",
        role=UserRole.USER,
        is_active=False
    )
    inactive.set_password("InactivePass123!")
    users.append(inactive)
    
    db_session.add_all(users)
    db_session.commit()
    
    return users


@pytest.fixture
def sample_documents(db_session):
    """Create sample man pages"""
    documents = []
    
    # Common commands
    common_commands = [
        ("ls", "list directory contents", 1),
        ("grep", "print lines matching a pattern", 1),
        ("find", "search for files in a directory hierarchy", 1),
        ("awk", "pattern scanning and processing language", 1),
        ("sed", "stream editor for filtering and transforming text", 1),
        ("git", "the fast distributed version control system", 1),
        ("docker", "manage Docker containers", 1),
        ("curl", "transfer a URL", 1),
        ("wget", "the non-interactive network downloader", 1),
        ("ssh", "OpenSSH SSH client", 1),
        ("vim", "Vi IMproved, a programmer's text editor", 1),
        ("nano", "Nano's ANOther editor", 1),
        ("man", "an interface to the system reference manuals", 1),
        ("chmod", "change file mode bits", 1),
        ("chown", "change file owner and group", 1),
        ("ps", "report a snapshot of current processes", 1),
        ("top", "display Linux processes", 1),
        ("kill", "send a signal to a process", 1),
        ("tar", "an archiving utility", 1),
        ("zip", "package and compress files", 1),
    ]
    
    for cmd, desc, section in common_commands:
        content = f""".TH {cmd.upper()} {section} "{fake.date()}" "Version 1.0" "User Commands"
.SH NAME
{cmd} \\- {desc}
.SH SYNOPSIS
.B {cmd}
[OPTIONS] [ARGUMENTS]
.SH DESCRIPTION
{fake.paragraph(nb_sentences=5)}
.SH OPTIONS
.TP
.B \\-h, \\-\\-help
Display help message and exit.
.TP
.B \\-v, \\-\\-version
Display version information and exit.
{generate_random_options()}
.SH EXAMPLES
{generate_examples(cmd)}
.SH SEE ALSO
.BR man (1),
.BR info (1)
.SH AUTHOR
{fake.name()}
.SH BUGS
Report bugs to <bugs@example.com>"""
        
        doc = ManPage(
            command=cmd,
            section=section,
            description=desc,
            content=content,
            html_content=f"<h1>{cmd}</h1><p>{desc}</p><p>{fake.paragraph()}</p>",
            tldr=fake.sentence(),
            platform="linux",
            version="1.0",
            source_file=f"/usr/share/man/man{section}/{cmd}.{section}.gz"
        )
        documents.append(doc)
    
    # Add some system commands (section 8)
    system_commands = [
        ("systemctl", "Control the systemd system and service manager", 8),
        ("iptables", "administration tool for IPv4 packet filtering", 8),
        ("fdisk", "manipulate disk partition table", 8),
    ]
    
    for cmd, desc, section in system_commands:
        doc = ManPage(
            command=cmd,
            section=section,
            description=desc,
            content=generate_man_content(cmd, desc, section),
            html_content=f"<h1>{cmd}</h1><p>{desc}</p>",
            tldr=fake.sentence(),
            platform="linux",
            version="1.0"
        )
        documents.append(doc)
    
    db_session.add_all(documents)
    db_session.commit()
    
    # Add tags
    tags = ["text-processing", "files", "network", "system", "development", "security"]
    for doc in documents[:10]:
        doc_tags = random.sample(tags, k=random.randint(1, 3))
        for tag_name in doc_tags:
            tag = ManPageTag(name=tag_name, manpage_id=doc.id)
            db_session.add(tag)
    
    db_session.commit()
    
    return documents


@pytest.fixture
def sample_favorites(db_session, sample_users, sample_documents):
    """Create sample user favorites"""
    favorites = []
    
    # Each user favorites some random documents
    for user in sample_users[:3]:
        fav_docs = random.sample(sample_documents, k=random.randint(2, 5))
        for doc in fav_docs:
            fav = UserFavorite(
                user_id=user.id,
                manpage_id=doc.id,
                created_at=fake.date_time_between(start_date='-30d', end_date='now')
            )
            favorites.append(fav)
    
    db_session.add_all(favorites)
    db_session.commit()
    
    return favorites


@pytest.fixture
def auth_headers(sample_users):
    """Generate auth headers for different user types"""
    auth_service = AuthService(db=None)
    
    headers = {}
    for user in sample_users:
        token = auth_service.create_access_token({"sub": str(user.id)})
        headers[user.username] = {"Authorization": f"Bearer {token}"}
    
    return headers


@pytest.fixture
def mock_redis():
    """Mock Redis client"""
    class MockRedis:
        def __init__(self):
            self.data = {}
            self.ttls = {}
        
        def get(self, key):
            if key in self.data:
                return self.data[key].encode() if isinstance(self.data[key], str) else self.data[key]
            return None
        
        def set(self, key, value, ex=None):
            self.data[key] = value
            if ex:
                self.ttls[key] = datetime.now() + timedelta(seconds=ex)
            return True
        
        def setex(self, key, time, value):
            return self.set(key, value, ex=time)
        
        def delete(self, *keys):
            for key in keys:
                self.data.pop(key, None)
                self.ttls.pop(key, None)
            return len(keys)
        
        def exists(self, key):
            return key in self.data
        
        def incr(self, key):
            val = int(self.data.get(key, 0))
            val += 1
            self.data[key] = str(val)
            return val
        
        def expire(self, key, time):
            if key in self.data:
                self.ttls[key] = datetime.now() + timedelta(seconds=time)
                return True
            return False
        
        def scan_iter(self, match=None):
            pattern = match.replace('*', '') if match else ''
            for key in self.data:
                if not pattern or pattern in key:
                    yield key
    
    return MockRedis()


def generate_random_options():
    """Generate random command options"""
    options = []
    for _ in range(random.randint(3, 8)):
        short = f"-{fake.random_letter()}"
        long = f"--{fake.word()}"
        desc = fake.sentence()
        options.append(f".TP\n.B {short}, {long}\n{desc}")
    
    return "\n".join(options)


def generate_examples(command):
    """Generate command examples"""
    examples = []
    for i in range(random.randint(2, 5)):
        desc = fake.sentence()
        cmd = f"{command} {' '.join(fake.words(nb=random.randint(1, 3)))}"
        examples.append(f".PP\n{desc}\n.PP\n.nf\n{cmd}\n.fi")
    
    return "\n".join(examples)


def generate_man_content(command, description, section):
    """Generate complete man page content"""
    return f""".TH {command.upper()} {section} "{fake.date()}" "Version 1.0" "System Administration"
.SH NAME
{command} \\- {description}
.SH SYNOPSIS
.B {command}
[OPTIONS] [ARGUMENTS]
.SH DESCRIPTION
{fake.paragraph(nb_sentences=8)}
.PP
{fake.paragraph(nb_sentences=6)}
.SH OPTIONS
{generate_random_options()}
.SH EXAMPLES
{generate_examples(command)}
.SH FILES
.TP
.I /etc/{command}.conf
Configuration file for {command}.
.TP
.I /var/log/{command}.log
Log file for {command}.
.SH ENVIRONMENT
.TP
.B {command.upper()}_HOME
Path to {command} home directory.
.SH EXIT STATUS
.TP
.B 0
Successful completion.
.TP
.B 1
General error.
.TP
.B 2
Invalid arguments.
.SH SEE ALSO
.BR systemd (1),
.BR journalctl (1)
.SH AUTHOR
{fake.name()} <{fake.email()}>
.SH COPYRIGHT
Copyright (C) {fake.year()} Example Corp."""


@pytest.fixture
def performance_data():
    """Generate data for performance testing"""
    # Generate large dataset
    large_docs = []
    for i in range(10000):
        large_docs.append({
            "id": i,
            "command": f"cmd{i}",
            "description": fake.sentence(),
            "content": fake.text(max_nb_chars=5000),
            "section": random.randint(1, 8)
        })
    
    return {
        "documents": large_docs,
        "queries": [fake.word() for _ in range(1000)],
        "users": [f"user{i}" for i in range(100)]
    }